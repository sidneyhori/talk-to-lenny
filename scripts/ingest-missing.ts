/**
 * Script to ingest specific missing episodes
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const EPISODES_DIR = path.join(process.cwd(), "data", "transcripts", "episodes");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function parseDuration(duration: string): number {
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

async function upsertGuest(guestName: string): Promise<string> {
  const slug = slugify(guestName);

  const { data: existing } = await supabase
    .from("guests")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    return existing.id;
  }

  const { data: newGuest, error } = await supabase
    .from("guests")
    .insert({
      name: guestName,
      slug,
      appearance_count: 1,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`Error creating guest ${guestName}:`, error);
    throw error;
  }

  return newGuest!.id;
}

async function chunkTranscript(episodeId: string, content: string): Promise<void> {
  await supabase.from("chunks").delete().eq("episode_id", episodeId);

  const TARGET_CHUNK_SIZE = 3200;
  const OVERLAP = 400;

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

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex,
      startTimestamp: currentTimestamp,
      speaker: currentSpeaker,
    });
  }

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
      console.error(`Error inserting chunks:`, error);
    }
  }

  console.log(`Created ${chunks.length} chunks`);
}

async function ingestEpisode(dirName: string) {
  const transcriptPath = path.join(EPISODES_DIR, dirName, "transcript.md");

  if (!fs.existsSync(transcriptPath)) {
    console.error(`Transcript not found: ${transcriptPath}`);
    return;
  }

  const fileContent = fs.readFileSync(transcriptPath, "utf-8");
  const { data: frontmatter, content } = matter(fileContent);

  console.log("Frontmatter:", frontmatter);

  if (!frontmatter.guest || !frontmatter.title) {
    console.error("Missing guest or title");
    return;
  }

  const slug = slugify(frontmatter.title);

  // Check if already exists
  const { data: existing } = await supabase
    .from("episodes")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    console.log(`Episode already exists: ${frontmatter.title}`);
    return;
  }

  // Create guest
  await upsertGuest(frontmatter.guest);

  // Calculate duration
  const durationSeconds = frontmatter.duration_seconds
    ? Math.round(frontmatter.duration_seconds)
    : parseDuration(frontmatter.duration || "0:00");

  // Use spotify_url if no youtube_url
  const url = frontmatter.youtube_url || frontmatter.spotify_url || "";
  const videoId = frontmatter.video_id || frontmatter.spotify_id || null;

  // Insert episode
  const { data: episode, error } = await supabase
    .from("episodes")
    .insert({
      guest_name: frontmatter.guest,
      title: frontmatter.title,
      youtube_url: url,
      video_id: videoId,
      publish_date: frontmatter.publish_date,
      description: frontmatter.description || null,
      duration_seconds: durationSeconds,
      view_count: frontmatter.view_count || 0,
      keywords: frontmatter.keywords || [],
      raw_transcript: content,
      slug,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`Error inserting episode:`, error);
    return;
  }

  console.log(`Inserted episode: ${frontmatter.title}`);

  // Chunk transcript
  await chunkTranscript(episode!.id, content);

  console.log("Done!");
}

// Episodes to ingest
const MISSING_EPISODES = ["nickey-skarstad"];

async function main() {
  for (const episode of MISSING_EPISODES) {
    console.log(`\n--- Ingesting ${episode} ---\n`);
    await ingestEpisode(episode);
  }
}

main().catch(console.error);
