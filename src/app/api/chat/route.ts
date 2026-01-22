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
    match_threshold: 0.1, // Lower threshold to catch name searches
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

// Text search for names and titles with fuzzy matching
async function textSearchEpisodes(
  supabase: ReturnType<typeof createServerClient>,
  query: string,
  limit: number = 5
): Promise<EpisodeDetail[]> {
  // Try exact match first
  const { data: exactMatches } = await supabase
    .from("episodes")
    .select("id, title, slug, guest_name, summary")
    .or(`title.ilike.%${query}%,guest_name.ilike.%${query}%`)
    .limit(limit);

  if (exactMatches && exactMatches.length > 0) {
    return exactMatches as EpisodeDetail[];
  }

  // If no exact match, try partial matching on individual words
  const words = query.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 0) {
    // Search for any word matching (helps with "Jenn" matching "Jeanne")
    const conditions = words.map(word =>
      `guest_name.ilike.%${word}%,title.ilike.%${word}%`
    ).join(',');

    const { data: partialMatches } = await supabase
      .from("episodes")
      .select("id, title, slug, guest_name, summary")
      .or(conditions)
      .limit(limit);

    return (partialMatches as EpisodeDetail[]) || [];
  }

  return [];
}

// Get chunks for specific episodes (when found via text search)
async function getChunksForEpisodes(
  supabase: ReturnType<typeof createServerClient>,
  episodeIds: string[],
  limit: number = 10
): Promise<ChunkMatch[]> {
  const { data } = await supabase
    .from("chunks")
    .select("id, episode_id, content, chunk_index, start_timestamp, speaker")
    .in("episode_id", episodeIds)
    .order("chunk_index", { ascending: true })
    .limit(limit);

  return (data || []).map((chunk: {
    id: string;
    episode_id: string;
    content: string;
    chunk_index: number;
    start_timestamp: string | null;
    speaker: string | null;
  }) => ({
    id: chunk.id,
    episode_id: chunk.episode_id,
    content: chunk.content,
    chunk_index: chunk.chunk_index,
    start_timestamp: chunk.start_timestamp,
    speaker: chunk.speaker,
    similarity: 1.0, // Text match = high relevance
  }));
}

interface FullEpisode {
  id: string;
  title: string;
  slug: string;
  guest_name: string;
  summary: string | null;
  raw_transcript: string;
}

// Search plan from LLM query planner
interface SearchPlan {
  searchQueries: string[];     // Multiple queries for better coverage
  guestFilter: string | null;  // Filter to specific guest if mentioned
  searchMode: "broad" | "focused" | "compare";  // Type of search
  intent: string;              // Brief description of what user wants
}

// Use LLM to plan the search strategy
async function planSearch(
  message: string,
  history: Array<{ role: string; content: string }>
): Promise<SearchPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      searchQueries: [message],
      guestFilter: null,
      searchMode: "broad",
      intent: message,
    };
  }

  const recentHistory = history.slice(-4).map(m =>
    `${m.role}: ${m.content.slice(0, 300)}`
  ).join('\n');

  const systemPrompt = `You are a search planner for a podcast RAG system with ~300 episodes about product management, growth, startups, and leadership.

Given the user's question and conversation history, create an optimal search plan.

Return JSON with:
1. searchQueries: Array of 2-4 search queries that will find relevant content. Include:
   - The main question rephrased for semantic search
   - Alternative phrasings or related concepts
   - If about a person, include their FULL FORMAL name + topic
   Example: ["Brian Chesky hiring philosophy", "Airbnb early team building", "founder hiring first employees"]

2. guestFilter: Guest name to filter by, or null for broad search.
   - IMPORTANT: Use the guest's FULL FORMAL NAME. Correct nicknames/misspellings:
     * "Jenn Grosser" or "Jeanne Grosser" → "Jeanne DeWitt Grosser"
     * "Chesky" → "Brian Chesky"
     * "Lenny" → null (he's the host, not a guest)
   - Set to guest name if user asks about a SPECIFIC person
   - Set to null if user asks about "other guests", "different perspectives", "across episodes", or general topics
   - Resolve pronouns (she/he/they) from history

3. searchMode:
   - "focused" = user wants content from one specific guest
   - "broad" = user wants to explore topic across many episodes
   - "compare" = user wants to compare perspectives from different guests

4. intent: One sentence describing what the user actually wants to know.

IMPORTANT: This system has 300 episodes. Default to broad search unless user specifically names someone. When user says "other", "different", "compare", "across episodes" → use broad mode with null guestFilter.

Respond with valid JSON only.`;

  const userPrompt = `History:
${recentHistory || '(none)'}

Question: ${message}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      console.error("Search planning failed:", response.status);
      return { searchQueries: [message], guestFilter: null, searchMode: "broad", intent: message };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("Search plan:", JSON.stringify(parsed));
      return {
        searchQueries: parsed.searchQueries || [message],
        guestFilter: parsed.guestFilter || null,
        searchMode: parsed.searchMode || "broad",
        intent: parsed.intent || message,
      };
    }
  } catch (error) {
    console.error("Search planning error:", error);
  }

  return { searchQueries: [message], guestFilter: null, searchMode: "broad", intent: message };
}

// Execute multiple searches and fuse results
async function multiQuerySearch(
  supabase: ReturnType<typeof createServerClient>,
  queries: string[],
  guestFilter: string | null,
  limit: number = 20
): Promise<{ chunks: ChunkMatch[]; episodes: EpisodeDetail[] }> {
  const allChunks: Map<string, ChunkMatch> = new Map();
  const relevantEpisodeIds: Set<string> = new Set();

  // If guest filter, first find their episodes
  let filterEpisodeIds: string[] | null = null;
  if (guestFilter) {
    const guestEpisodes = await textSearchEpisodes(supabase, guestFilter, 5);
    if (guestEpisodes.length > 0) {
      filterEpisodeIds = guestEpisodes.map(e => e.id);
      console.log(`Guest filter "${guestFilter}" matched ${guestEpisodes.length} episodes`);
    }
  }

  // Run semantic search for each query
  for (const query of queries) {
    try {
      const embedding = await getEmbedding(query);

      if (filterEpisodeIds) {
        // Search within filtered episodes
        for (const epId of filterEpisodeIds) {
          const chunks = await searchChunks(supabase, embedding, epId, 8);
          for (const chunk of chunks) {
            if (!allChunks.has(chunk.id) || chunk.similarity > allChunks.get(chunk.id)!.similarity) {
              allChunks.set(chunk.id, chunk);
              relevantEpisodeIds.add(chunk.episode_id);
            }
          }
        }
      } else {
        // Broad search across all episodes
        const chunks = await searchChunks(supabase, embedding, undefined, 10);
        for (const chunk of chunks) {
          if (!allChunks.has(chunk.id) || chunk.similarity > allChunks.get(chunk.id)!.similarity) {
            allChunks.set(chunk.id, chunk);
            relevantEpisodeIds.add(chunk.episode_id);
          }
        }
      }
    } catch (error) {
      console.error(`Search failed for query "${query}":`, error);
    }
  }

  // Sort by similarity and take top results
  const sortedChunks = Array.from(allChunks.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  // Get episode details
  const episodes = relevantEpisodeIds.size > 0
    ? await getEpisodeDetails(supabase, Array.from(relevantEpisodeIds))
    : [];

  console.log(`Multi-query search: ${queries.length} queries → ${allChunks.size} unique chunks → ${sortedChunks.length} top results from ${episodes.length} episodes`);

  return { chunks: sortedChunks, episodes };
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

    const supabase = createServerClient();

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
    } else {
      // Global chat: Use LLM to plan search, then multi-query retrieval
      const searchPlan = await planSearch(message, history);
      console.log(`Search mode: ${searchPlan.searchMode}, Guest filter: ${searchPlan.guestFilter || 'none'}`);
      console.log(`Queries: ${searchPlan.searchQueries.join(' | ')}`);

      // Execute multi-query search
      const { chunks, episodes } = await multiQuerySearch(
        supabase,
        searchPlan.searchQueries,
        searchPlan.guestFilter,
        20
      );

      const episodeMap = new Map(episodes.map((e) => [e.id, e]));

      // Build context with episode metadata
      context = chunks
        .map((chunk) => {
          const ep = episodeMap.get(chunk.episode_id);
          return `[${ep?.guest_name || "Unknown"} in "${ep?.title || "Unknown"}"${chunk.start_timestamp ? ` at ${chunk.start_timestamp}` : ""}]:\n${chunk.content}`;
        })
        .join("\n\n---\n\n");

      // Build sources (deduplicated by episode)
      const episodeSourceMap = new Map<string, {
        episodeId: string;
        episodeTitle: string;
        episodeSlug: string;
        timestamps: string[];
        guestName: string;
      }>();

      for (const chunk of chunks) {
        const ep = episodeMap.get(chunk.episode_id);
        if (!ep) continue;

        if (!episodeSourceMap.has(chunk.episode_id)) {
          episodeSourceMap.set(chunk.episode_id, {
            episodeId: chunk.episode_id,
            episodeTitle: ep.title,
            episodeSlug: ep.slug,
            timestamps: [],
            guestName: ep.guest_name,
          });
        }

        if (chunk.start_timestamp) {
          episodeSourceMap.get(chunk.episode_id)!.timestamps.push(chunk.start_timestamp);
        }
      }

      sources = Array.from(episodeSourceMap.values()).slice(0, 5).map((src) => {
        let timestamp: string | undefined;
        if (src.timestamps.length > 1) {
          const sorted = src.timestamps.sort();
          timestamp = `${sorted[0]} - ${sorted[sorted.length - 1]}`;
        } else if (src.timestamps.length === 1) {
          timestamp = src.timestamps[0];
        }

        return {
          episodeId: src.episodeId,
          episodeTitle: src.episodeTitle,
          episodeSlug: src.episodeSlug,
          timestamp,
          snippet: `Guest: ${src.guestName}`,
        };
      });

    }

    // Build conversation history
    const conversationHistory = history.slice(-6).map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Create the prompt - different for episode-specific vs global chat
    let systemPrompt: string;

    if (episodeId) {
      // Episode-specific system prompt
      systemPrompt = `You are an AI assistant helping users explore a specific episode of Lenny's Podcast.

Your job:
- Answer questions about this episode's content
- Quote the guest directly when relevant
- Reference specific moments or topics from the conversation
- If asked about something not covered in this episode, say so

Keep responses focused and conversational. The user is reading/watching this specific episode.

Episode transcript:
${context}`;
    } else {
      // Global chat system prompt
      systemPrompt = `You are an AI assistant for exploring Lenny's Podcast—a library of ~300 episodes about product management, growth, startups, and leadership featuring world-class operators and founders.

Your job:
- Synthesize insights from the transcript excerpts provided
- Always attribute quotes and ideas to the specific guest who said them
- When multiple guests discuss a topic, compare their perspectives
- If asked about "other" perspectives, draw from different guests in the context
- Be specific: quote directly when impactful, cite the guest name
- If the context doesn't cover the question, say so and suggest what topics/guests might be relevant

IMPORTANT: Never mention implementation details like "excerpts", "chunks", "context loaded", or how many pieces of transcript you have. Just answer naturally as if you have deep knowledge of the podcast library. Sources will be shown separately to the user.

Context from transcripts:
${context}`;
    }

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
