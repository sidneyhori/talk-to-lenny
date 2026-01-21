import { createServerClient } from "@/lib/supabase";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

// Use Node.js runtime for better env var and database support
export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequest {
  message: string;
  episodeId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embedding API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error(`Invalid embedding response: ${JSON.stringify(data)}`);
  }
  return data.data[0].embedding;
}

interface ChunkMatch {
  id: string;
  episode_id: string;
  content: string;
  chunk_index: number;
  start_timestamp: string | null;
  speaker: string | null;
  similarity: number;
}

async function searchChunks(
  supabase: ReturnType<typeof createServerClient>,
  embedding: number[],
  episodeId?: string,
  limit: number = 8
): Promise<ChunkMatch[]> {
  // Try passing embedding directly - Supabase should handle the conversion
  // @ts-expect-error - RPC function types not inferred by Supabase client
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_threshold: 0.2, // Lower threshold for better recall
    match_count: limit,
    filter_episode_id: episodeId || null,
  });

  if (error) {
    console.error("Error searching chunks:", error);
    console.error("Error details:", JSON.stringify(error));
    console.error("Episode ID filter:", episodeId);
    return [];
  }

  const chunks = (data as ChunkMatch[]) || [];
  console.log(`Found ${chunks.length} chunks for query (episodeId: ${episodeId || 'all'})`);

  return chunks;
}

interface EpisodeDetail {
  id: string;
  title: string;
  slug: string;
  guest_name: string;
  summary?: string | null;
}

async function getEpisodeDetails(
  supabase: ReturnType<typeof createServerClient>,
  episodeIds: string[]
): Promise<EpisodeDetail[]> {
  const { data } = await supabase
    .from("episodes")
    .select("id, title, slug, guest_name, summary")
    .in("id", episodeIds);

  return (data as EpisodeDetail[]) || [];
}

interface FullEpisode {
  id: string;
  title: string;
  slug: string;
  guest_name: string;
  summary: string | null;
  raw_transcript: string;
}

// Get full episode for episode-specific chat
async function getFullEpisode(
  supabase: ReturnType<typeof createServerClient>,
  episodeId: string
): Promise<FullEpisode | null> {
  const { data } = await supabase
    .from("episodes")
    .select("id, title, slug, guest_name, summary, raw_transcript")
    .eq("id", episodeId)
    .single();

  return data as FullEpisode | null;
}

export async function POST(req: Request) {
  try {
    const { message, episodeId, history = [] }: ChatRequest = await req.json();
    console.log(`Chat request: message="${message.slice(0, 50)}...", episodeId=${episodeId || 'none'}`);
    console.log("Env check - SUPABASE_URL:", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log("Env check - SERVICE_KEY:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log("Env check - OPENAI_KEY:", !!process.env.OPENAI_API_KEY);

    const supabase = createServerClient();

    // Generate embedding for the query
    let embedding: number[];
    try {
      embedding = await getEmbedding(message);
      console.log(`Got embedding with ${embedding.length} dimensions`);
    } catch (embError) {
      console.error("Embedding error:", embError);
      throw embError;
    }

    let context = "";
    let sources: Array<{
      episodeId: string;
      episodeTitle: string;
      episodeSlug: string;
      timestamp?: string;
      snippet: string;
    }> = [];

    if (episodeId) {
      // Episode-specific chat: use the full transcript
      const episode = await getFullEpisode(supabase, episodeId);

      if (episode) {
        context = `Episode: ${episode.title}\nGuest: ${episode.guest_name}\n`;
        if (episode.summary) {
          context += `Summary: ${episode.summary}\n`;
        }
        context += `\nFull Transcript:\n${episode.raw_transcript}`;

        sources = [{
          episodeId: episode.id,
          episodeTitle: episode.title,
          episodeSlug: episode.slug,
          snippet: episode.summary || episode.title,
        }];
      }
      console.log(`Episode-specific chat: loaded full transcript for ${episode?.title}`);
    } else {
      // Global chat: use semantic search across all episodes
      const chunks = await searchChunks(supabase, embedding, undefined, 10);
      console.log(`Global chat: found ${chunks.length} relevant chunks`);

      const episodeIds = [...new Set(chunks.map((c) => c.episode_id))];
      const episodes = await getEpisodeDetails(supabase, episodeIds);
      const episodeMap = new Map(episodes.map((e) => [e.id, e]));

      context = chunks
        .map((chunk) => {
          const ep = episodeMap.get(chunk.episode_id);
          return `[From "${ep?.title || "Unknown"}" with ${ep?.guest_name || "Unknown"}${chunk.start_timestamp ? ` at ${chunk.start_timestamp}` : ""}]:\n${chunk.content}`;
        })
        .join("\n\n---\n\n");

      sources = chunks.slice(0, 5).map((chunk) => {
        const ep = episodeMap.get(chunk.episode_id);
        return {
          episodeId: chunk.episode_id,
          episodeTitle: ep?.title || "Unknown",
          episodeSlug: ep?.slug || "",
          timestamp: chunk.start_timestamp || undefined,
          snippet: chunk.content.slice(0, 150) + "...",
        };
      });
    }

    // Build conversation history
    const conversationHistory = history.slice(-6).map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Create the prompt
    const systemPrompt = `You are an AI assistant that helps users explore insights from Lenny's Podcast, a popular podcast about product management, growth, and leadership.

You have access to transcripts from the podcast. Use the context provided to answer questions accurately and helpfully. When answering:
- Reference specific quotes or insights from the transcripts when relevant
- Mention the guest's name when citing their advice
- Be conversational but informative
- If the context doesn't contain relevant information, say so honestly
- Keep responses concise but comprehensive

${episodeId ? "You are answering questions about a specific episode." : "You are answering questions across all episodes."}

Context from transcripts:
${context}`;

    // Stream the response
    const result = streamText({
      model: openai("gpt-5.2"),
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: "user", content: message },
      ],
    });

    // Create a custom stream that appends sources
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const textStream = result.textStream;

        for await (const chunk of textStream) {
          controller.enqueue(encoder.encode(chunk));
        }

        // Append sources marker and data
        controller.enqueue(encoder.encode("__SOURCES__" + JSON.stringify(sources)));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Error: ${errorMessage}`, { status: 500 });
  }
}
