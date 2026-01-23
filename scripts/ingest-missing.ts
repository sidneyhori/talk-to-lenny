/**
 * Ingest Missing Episodes
 * 
 * Ingests episodes that exist in source transcripts but not in the database
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
const DATA_DIR = path.join(process.cwd(), "data", "transcripts", "episodes");

// Episodes to skip (known bad data)
const SKIP_FOLDERS = ["teaser_2021", "interview-q-compilation"];

// Manual metadata fixes for episodes with issues
const METADATA_FIXES: Record<string, { title: string; youtube_url?: string; duration_seconds?: number }> = {
  "daniel-lereya": {
    title: "Inside monday.com's transformation: radical transparency, impact over output, and their path to $1B ARR | Daniel Lereya (Chief Product and Technology Officer)",
    youtube_url: "https://www.youtube.com/watch?v=example", // Placeholder
    duration_seconds: 5400,
  },
  "peter-deng": {
    title: "Building products at Meta, Uber, and Airtable | Peter Deng",
    youtube_url: "https://www.youtube.com/watch?v=example",
    duration_seconds: 5400,
  },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function getBaseName(name: string): string {
  return name.replace(/\s+\d+(\.\d+)?$/, "").trim();
}

async function getExistingEpisodeSlugs(): Promise<Set<string>> {
  const { data } = await supabase.from("episodes").select("slug");
  return new Set((data || []).map((e) => e.slug));
}

async function getExistingGuestNames(): Promise<Map<string, string>> {
  const { data } = await supabase.from("guests").select("id, name");
  const map = new Map<string, string>();
  for (const g of data || []) {
    map.set(g.name, g.id);
  }
  return map;
}

async function main() {
  const executeFlag = process.argv.includes("--execute");

  console.log("Finding missing episodes...\n");

  const existingSlugs = await getExistingEpisodeSlugs();
  const existingGuests = await getExistingGuestNames();

  console.log(`Existing episodes: ${existingSlugs.size}`);
  console.log(`Existing guests: ${existingGuests.size}\n`);

  // Get all folders
  const folders = fs.readdirSync(DATA_DIR).filter((f) => {
    const fullPath = path.join(DATA_DIR, f);
    return fs.statSync(fullPath).isDirectory() && !SKIP_FOLDERS.includes(f);
  });

  const toIngest: Array<{
    folder: string;
    guest: string;
    title: string;
    youtube_url: string;
    duration_seconds: number;
    content: string;
  }> = [];

  for (const folder of folders) {
    const transcriptPath = path.join(DATA_DIR, folder, "transcript.md");
    if (!fs.existsSync(transcriptPath)) continue;

    const fileContent = fs.readFileSync(transcriptPath, "utf-8");
    const { data, content } = matter(fileContent);

    // Apply manual fixes if available
    const fixes = METADATA_FIXES[folder];
    const title = fixes?.title || data.title;
    const youtube_url = fixes?.youtube_url || data.youtube_url;
    const duration_seconds = fixes?.duration_seconds || data.duration_seconds || 3600;

    // Get base guest name (without 2.0 suffix)
    const guestName = getBaseName(data.guest || folder);
    
    // Create slug from title
    const slug = slugify(title);

    // Skip if already exists
    if (existingSlugs.has(slug)) {
      continue;
    }

    // Skip if no title or content
    if (!title || title === data.guest || content.trim().length < 100) {
      if (!fixes) {
        console.log(`⚠️  Skipping ${folder}: Missing proper title or content`);
        continue;
      }
    }

    toIngest.push({
      folder,
      guest: guestName,
      title,
      youtube_url: youtube_url || "",
      duration_seconds,
      content: content.trim(),
    });
  }

  console.log(`\n=== EPISODES TO INGEST (${toIngest.length}) ===\n`);

  for (const ep of toIngest) {
    console.log(`📁 ${ep.folder}`);
    console.log(`   Guest: ${ep.guest}`);
    console.log(`   Title: ${ep.title.substring(0, 80)}...`);
    console.log(`   Content: ${ep.content.length} chars`);
    console.log();
  }

  if (!executeFlag) {
    console.log("=== DRY RUN ===");
    console.log("Run with --execute to ingest these episodes:");
    console.log("  npx ts-node scripts/ingest-missing.ts --execute");
    return;
  }

  console.log("=== INGESTING EPISODES ===\n");

  let success = 0;
  let failed = 0;

  for (const ep of toIngest) {
    const slug = slugify(ep.title);

    // Ensure guest exists
    let guestId = existingGuests.get(ep.guest);
    if (!guestId) {
      const { data: newGuest, error: guestError } = await supabase
        .from("guests")
        .insert({
          name: ep.guest,
          slug: slugify(ep.guest),
          appearance_count: 0,
        })
        .select("id")
        .single();

      if (guestError || !newGuest) {
        console.log(`❌ Failed to create guest ${ep.guest}: ${guestError?.message || "Unknown error"}`);
        failed++;
        continue;
      }
      guestId = newGuest.id;
      existingGuests.set(ep.guest, guestId!);
    }

    // Insert episode
    const { error: episodeError } = await supabase.from("episodes").insert({
      guest_name: ep.guest,
      title: ep.title,
      youtube_url: ep.youtube_url,
      publish_date: new Date().toISOString().split("T")[0], // Use today if no date
      duration_seconds: ep.duration_seconds,
      raw_transcript: ep.content,
      slug,
    });

    if (episodeError) {
      console.log(`❌ Failed to insert ${ep.folder}: ${episodeError.message}`);
      failed++;
      continue;
    }

    console.log(`✅ Inserted: ${ep.title.substring(0, 60)}...`);
    success++;
  }

  // Update guest appearance counts
  console.log("\nUpdating guest appearance counts...");
  const { data: guests } = await supabase.from("guests").select("id, name");
  for (const guest of guests || []) {
    const { count } = await supabase
      .from("episodes")
      .select("*", { count: "exact", head: true })
      .eq("guest_name", guest.name);

    await supabase
      .from("guests")
      .update({ appearance_count: count || 0 })
      .eq("id", guest.id);
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
