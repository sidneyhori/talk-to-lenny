/**
 * Create chunks for episodes that don't have them
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function chunkTranscript(
  episodeId: string,
  content: string
): Promise<number> {
  // Delete existing chunks for this episode (in case of re-run)
  await supabase.from("chunks").delete().eq("episode_id", episodeId);

  // Simple chunking strategy: split by paragraphs and group to ~800 tokens
  const TARGET_CHUNK_SIZE = 3200; // ~800 tokens * 4 chars
  const OVERLAP = 400; // ~100 tokens overlap

  const paragraphs = content.split(/\n\n+/);
  const chunks: Array<{
    content: string;
    chunkIndex: number;
    startTimestamp: string | null;
    speaker: string | null;
  }> = [];

  let currentChunk = "";
  let chunkIndex = 0;
  let currentTimestamp: string | null = null;
  let currentSpeaker: string | null = null;

  for (const paragraph of paragraphs) {
    // Try to extract timestamp and speaker
    const timestampMatch = paragraph.match(
      /[\[\(]?(\d{1,2}:\d{2}(?::\d{2})?)[\]\)]?\s*([A-Za-z\s]+)?:/
    );

    if (timestampMatch) {
      currentTimestamp = timestampMatch[1];
      if (timestampMatch[2]) {
        currentSpeaker = timestampMatch[2].trim();
      }
    }

    if (currentChunk.length + paragraph.length > TARGET_CHUNK_SIZE) {
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          chunkIndex,
          startTimestamp: currentTimestamp,
          speaker: currentSpeaker,
        });
        chunkIndex++;
      }

      const overlapText = currentChunk.slice(-OVERLAP);
      currentChunk = overlapText + "\n\n" + paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  // Save final chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex,
      startTimestamp: currentTimestamp,
      speaker: currentSpeaker,
    });
  }

  // Insert chunks in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE).map((chunk) => ({
      episode_id: episodeId,
      content: chunk.content,
      chunk_index: chunk.chunkIndex,
      start_timestamp: chunk.startTimestamp,
      speaker: chunk.speaker,
      token_count: Math.ceil(chunk.content.length / 4),
    }));

    const { error } = await supabase.from("chunks").insert(batch);

    if (error) {
      console.error(`Error inserting chunks for episode ${episodeId}:`, error);
    }
  }

  return chunks.length;
}

async function main() {
  console.log("Finding episodes without chunks...\n");

  // Get all episodes
  const { data: allEpisodes } = await supabase
    .from("episodes")
    .select("id, guest_name, title, raw_transcript");

  const episodesWithoutChunks: typeof allEpisodes = [];

  for (const ep of allEpisodes || []) {
    const { count } = await supabase
      .from("chunks")
      .select("*", { count: "exact", head: true })
      .eq("episode_id", ep.id);

    if (!count || count === 0) {
      episodesWithoutChunks.push(ep);
    }
  }

  console.log(`Found ${episodesWithoutChunks.length} episodes without chunks\n`);

  for (const ep of episodesWithoutChunks) {
    console.log(`Processing: ${ep.guest_name}`);
    const numChunks = await chunkTranscript(ep.id, ep.raw_transcript);
    console.log(`  Created ${numChunks} chunks\n`);
  }

  console.log("Done creating chunks!");
}

main().catch(console.error);
