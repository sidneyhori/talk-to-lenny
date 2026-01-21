import { createServerClient } from "@/lib/supabase";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export const runtime = "edge";

interface ChatRequest {
  message: string;
  episodeId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  const data = await response.json();
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
  // @ts-expect-error - RPC function types not inferred by Supabase client
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: limit,
    filter_episode_id: episodeId || null,
  });

  if (error) {
    console.error("Error searching chunks:", error);
    return [];
  }

  return (data as ChunkMatch[]) || [];
}

interface EpisodeDetail {
  id: string;
  title: string;
  slug: string;
  guest_name: string;
}

async function getEpisodeDetails(
  supabase: ReturnType<typeof createServerClient>,
  episodeIds: string[]
): Promise<EpisodeDetail[]> {
  const { data } = await supabase
    .from("episodes")
    .select("id, title, slug, guest_name")
    .in("id", episodeIds);

  return (data as EpisodeDetail[]) || [];
}

export async function POST(req: Request) {
  try {
    const { message, episodeId, history = [] }: ChatRequest = await req.json();

    const supabase = createServerClient();

    // Generate embedding for the query
    const embedding = await getEmbedding(message);

    // Search for relevant chunks
    const chunks = await searchChunks(supabase, embedding, episodeId);

    // Get episode details for sources
    const episodeIds = [...new Set(chunks.map((c) => c.episode_id))];
    const episodes = await getEpisodeDetails(supabase, episodeIds);
    const episodeMap = new Map(episodes.map((e) => [e.id, e]));

    // Build context from chunks
    const context = chunks
      .map((chunk) => {
        const episode = episodeMap.get(chunk.episode_id);
        return `[From "${episode?.title || "Unknown"}" with ${episode?.guest_name || "Unknown"}${chunk.start_timestamp ? ` at ${chunk.start_timestamp}` : ""}]:\n${chunk.content}`;
      })
      .join("\n\n---\n\n");

    // Build sources for citation
    const sources = chunks.slice(0, 5).map((chunk) => {
      const episode = episodeMap.get(chunk.episode_id);
      return {
        episodeId: chunk.episode_id,
        episodeTitle: episode?.title || "Unknown",
        episodeSlug: episode?.slug || "",
        timestamp: chunk.start_timestamp || undefined,
        snippet: chunk.content.slice(0, 150) + "...",
      };
    });

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
      model: openai("gpt-4o"),
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
    return new Response("Internal server error", { status: 500 });
  }
}
