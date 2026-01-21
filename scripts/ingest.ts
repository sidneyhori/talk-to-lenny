/**
 * Data Ingestion Script
 *
 * This script:
 * 1. Clones/pulls the lennys-podcast-transcripts repo
 * 2. Parses all markdown files with YAML frontmatter
 * 3. Inserts episodes into Supabase
 * 4. Creates/updates guests
 * 5. Chunks transcripts for RAG
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import matter from "gray-matter";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

const REPO_URL = "https://github.com/ChatPRD/lennys-podcast-transcripts.git";
const DATA_DIR = path.join(process.cwd(), "data", "transcripts");

interface TranscriptFrontmatter {
  guest: string;
  title: string;
  youtube_url: string;
  publish_date: string;
  duration: string;
  view_count?: number;
  keywords?: string[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function parseDuration(duration: string): number {
  // Parse duration like "1:23:45" or "45:30" to seconds
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return match ? match[1] : null;
}

async function cloneOrPullRepo() {
  console.log("Fetching transcripts repository...");

  if (fs.existsSync(DATA_DIR)) {
    console.log("Repository exists, pulling latest changes...");
    execSync("git pull", { cwd: DATA_DIR, stdio: "inherit" });
  } else {
    console.log("Cloning repository...");
    fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
    execSync(`git clone ${REPO_URL} ${DATA_DIR}`, { stdio: "inherit" });
  }
}

async function parseTranscripts(): Promise<
  Array<{
    frontmatter: TranscriptFrontmatter;
    content: string;
    filename: string;
  }>
> {
  console.log("Parsing transcript files...");

  const transcriptsDir = path.join(DATA_DIR, "transcripts");
  if (!fs.existsSync(transcriptsDir)) {
    // Try root directory if transcripts folder doesn't exist
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".md"));
    return files.map((filename) => {
      const filepath = path.join(DATA_DIR, filename);
      const fileContent = fs.readFileSync(filepath, "utf-8");
      const { data, content } = matter(fileContent);
      return {
        frontmatter: data as TranscriptFrontmatter,
        content,
        filename,
      };
    });
  }

  const files = fs.readdirSync(transcriptsDir).filter((f) => f.endsWith(".md"));

  return files.map((filename) => {
    const filepath = path.join(transcriptsDir, filename);
    const fileContent = fs.readFileSync(filepath, "utf-8");
    const { data, content } = matter(fileContent);
    return {
      frontmatter: data as TranscriptFrontmatter,
      content,
      filename,
    };
  });
}

async function upsertGuest(guestName: string): Promise<string> {
  const slug = slugify(guestName);

  // Try to find existing guest
  const { data: existing } = await supabase
    .from("guests")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    // Increment appearance count
    await supabase
      .from("guests")
      .update({
        appearance_count: supabase.rpc("increment_appearance", {
          guest_slug: slug,
        }),
      })
      .eq("id", existing.id);
    return existing.id;
  }

  // Create new guest
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

async function insertEpisode(
  frontmatter: TranscriptFrontmatter,
  content: string,
  filename: string
): Promise<string | null> {
  const slug = slugify(frontmatter.title);

  // Check if episode already exists
  const { data: existing } = await supabase
    .from("episodes")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    console.log(`Episode already exists: ${frontmatter.title}`);
    return existing.id;
  }

  const videoId = extractVideoId(frontmatter.youtube_url);
  const durationSeconds = parseDuration(frontmatter.duration || "0:00");

  const { data: episode, error } = await supabase
    .from("episodes")
    .insert({
      guest_name: frontmatter.guest,
      title: frontmatter.title,
      youtube_url: frontmatter.youtube_url,
      video_id: videoId,
      publish_date: frontmatter.publish_date,
      duration_seconds: durationSeconds,
      view_count: frontmatter.view_count || 0,
      keywords: frontmatter.keywords || [],
      raw_transcript: content,
      slug,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`Error inserting episode ${frontmatter.title}:`, error);
    return null;
  }

  console.log(`Inserted episode: ${frontmatter.title}`);
  return episode!.id;
}

async function chunkTranscript(
  episodeId: string,
  content: string
): Promise<void> {
  // Delete existing chunks for this episode
  await supabase.from("chunks").delete().eq("episode_id", episodeId);

  // Simple chunking strategy: split by paragraphs and group to ~800 tokens
  // A rough approximation is ~4 characters per token
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
    // Try to extract timestamp and speaker from transcript format
    // Common formats: [00:12:34] Speaker: text or (12:34) Speaker text
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
      // Save current chunk
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          chunkIndex,
          startTimestamp: currentTimestamp,
          speaker: currentSpeaker,
        });
        chunkIndex++;
      }

      // Start new chunk with overlap
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
      token_count: Math.ceil(chunk.content.length / 4), // Rough estimate
    }));

    const { error } = await supabase.from("chunks").insert(batch);

    if (error) {
      console.error(`Error inserting chunks for episode ${episodeId}:`, error);
    }
  }

  console.log(`Created ${chunks.length} chunks for episode ${episodeId}`);
}

async function main() {
  console.log("Starting data ingestion...\n");

  // Step 1: Clone or pull the transcripts repo
  await cloneOrPullRepo();

  // Step 2: Parse all transcript files
  const transcripts = await parseTranscripts();
  console.log(`Found ${transcripts.length} transcripts\n`);

  // Step 3: Process each transcript
  let processed = 0;
  let errors = 0;

  for (const transcript of transcripts) {
    try {
      // Ensure guest exists
      if (transcript.frontmatter.guest) {
        await upsertGuest(transcript.frontmatter.guest);
      }

      // Insert episode
      const episodeId = await insertEpisode(
        transcript.frontmatter,
        transcript.content,
        transcript.filename
      );

      if (episodeId) {
        // Chunk the transcript for RAG
        await chunkTranscript(episodeId, transcript.content);
        processed++;
      }
    } catch (err) {
      console.error(`Error processing ${transcript.filename}:`, err);
      errors++;
    }

    // Progress update every 10 episodes
    if ((processed + errors) % 10 === 0) {
      console.log(
        `Progress: ${processed + errors}/${transcripts.length} (${errors} errors)`
      );
    }
  }

  console.log(`\nIngestion complete!`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
