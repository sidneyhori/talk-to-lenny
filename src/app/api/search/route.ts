import { createServerClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import {
  SearchRequestSchema,
  escapeILikePattern,
  checkRateLimit,
  getClientIp,
} from "@/lib/security";

// Use Node.js runtime for better env var and database support
export const runtime = "nodejs";

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
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error("Invalid embedding response");
  }
  return data.data[0].embedding;
}

export async function POST(req: Request) {
  try {
    // Rate limiting
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(`search:${clientIp}`, 30, 60000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(rateLimit.resetIn / 1000).toString(),
          },
        }
      );
    }

    // Validate request body
    const body = await req.json();
    const parseResult = SearchRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request format" },
        { status: 400 }
      );
    }

    const { query, type, limit } = parseResult.data;

    const supabase = createServerClient();

    let results: Array<{
      id: string;
      title: string;
      guest_name: string;
      slug: string;
      publish_date: string;
      summary: string | null;
      score: number;
    }> = [];

    if (type === "semantic" || type === "hybrid") {
      // Semantic search
      const embedding = await getEmbedding(query);

      // @ts-expect-error - RPC function types not inferred by Supabase client
      const rpcResult = await supabase.rpc("match_chunks", {
        query_embedding: embedding,
        match_threshold: 0.2, // Lower threshold for better recall
        match_count: limit * 2,
      });

      const chunks = rpcResult.data as Array<{ episode_id: string; similarity: number }> | null;

      if (chunks && chunks.length > 0) {
        // Get unique episode IDs and their best scores
        const episodeScores = new Map<string, number>();
        for (const chunk of chunks) {
          const currentScore = episodeScores.get(chunk.episode_id) || 0;
          episodeScores.set(
            chunk.episode_id,
            Math.max(currentScore, chunk.similarity)
          );
        }

        const episodeIds = [...episodeScores.keys()].slice(0, limit);

        const { data: episodes } = await supabase
          .from("episodes")
          .select("id, title, guest_name, slug, publish_date, summary")
          .in("id", episodeIds) as unknown as { data: Array<{ id: string; title: string; guest_name: string; slug: string; publish_date: string; summary: string | null }> | null };

        if (episodes) {
          results = episodes.map((ep) => ({
            ...ep,
            score: episodeScores.get(ep.id) || 0,
          }));
        }
      }
    }

    if (type === "text" || (type === "hybrid" && results.length < limit)) {
      // Full-text search fallback - sanitize query for ILIKE
      const sanitizedQuery = escapeILikePattern(query);
      const { data: textResults } = await supabase
        .from("episodes")
        .select("id, title, guest_name, slug, publish_date, summary")
        .or(`title.ilike.%${sanitizedQuery}%,guest_name.ilike.%${sanitizedQuery}%,raw_transcript.ilike.%${sanitizedQuery}%`)
        .limit(limit) as unknown as { data: Array<{ id: string; title: string; guest_name: string; slug: string; publish_date: string; summary: string | null }> | null };

      if (textResults) {
        // Merge with semantic results, avoiding duplicates
        const existingIds = new Set(results.map((r) => r.id));
        for (const ep of textResults) {
          if (!existingIds.has(ep.id)) {
            results.push({ ...ep, score: 0.5 }); // Lower score for text matches
          }
        }
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      results: results.slice(0, limit),
      query,
      type,
    });
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
