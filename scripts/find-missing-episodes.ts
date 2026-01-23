/**
 * Find Missing Episodes
 * 
 * Compares episodes in the source transcripts folder with what's in the database
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

interface TranscriptInfo {
  folder: string;
  guest: string;
  title: string;
  youtube_url: string;
  hasContent: boolean;
  contentLength: number;
  issues: string[];
}

async function getSourceTranscripts(): Promise<TranscriptInfo[]> {
  const transcripts: TranscriptInfo[] = [];

  if (!fs.existsSync(DATA_DIR)) {
    console.error("Episodes directory not found:", DATA_DIR);
    return [];
  }

  const folders = fs.readdirSync(DATA_DIR).filter((f) => {
    const fullPath = path.join(DATA_DIR, f);
    return fs.statSync(fullPath).isDirectory();
  });

  for (const folder of folders) {
    const transcriptPath = path.join(DATA_DIR, folder, "transcript.md");

    if (!fs.existsSync(transcriptPath)) {
      continue;
    }

    try {
      const fileContent = fs.readFileSync(transcriptPath, "utf-8");
      const { data, content } = matter(fileContent);

      const issues: string[] = [];
      
      if (!data.title || data.title === data.guest) {
        issues.push("Missing proper title");
      }
      if (!data.youtube_url) {
        issues.push("Missing youtube_url");
      }
      if (!data.duration_seconds || data.duration_seconds === 0) {
        issues.push("Missing duration");
      }

      transcripts.push({
        folder,
        guest: data.guest || folder,
        title: data.title || folder,
        youtube_url: data.youtube_url || "",
        hasContent: content.trim().length > 100,
        contentLength: content.trim().length,
        issues,
      });
    } catch (err) {
      console.error(`Error parsing ${folder}:`, err);
    }
  }

  return transcripts;
}

async function getDatabaseEpisodes(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("episodes")
    .select("slug, guest_name, title");

  if (error) {
    console.error("Error fetching episodes:", error);
    return new Set();
  }

  // Create a set of slugs and also normalized guest names for matching
  const slugs = new Set<string>();
  for (const ep of data || []) {
    slugs.add(ep.slug);
    // Also add slugified guest name for matching
    slugs.add(slugify(ep.guest_name));
  }

  return slugs;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

async function main() {
  console.log("Comparing source transcripts with database...\n");

  const sourceTranscripts = await getSourceTranscripts();
  const dbSlugs = await getDatabaseEpisodes();

  console.log(`Source transcripts: ${sourceTranscripts.length}`);
  console.log(`Database episodes: ${dbSlugs.size / 2} (approx)\n`); // Divide by 2 since we add both slug and guest name

  // Find missing episodes
  const missing: TranscriptInfo[] = [];
  const withIssues: TranscriptInfo[] = [];

  for (const transcript of sourceTranscripts) {
    const folderSlug = slugify(transcript.folder);
    const guestSlug = slugify(transcript.guest);
    
    // Check if in database (by folder name or guest name)
    if (!dbSlugs.has(folderSlug) && !dbSlugs.has(guestSlug)) {
      missing.push(transcript);
    }

    if (transcript.issues.length > 0) {
      withIssues.push(transcript);
    }
  }

  // Report missing episodes
  if (missing.length > 0) {
    console.log(`\n=== MISSING FROM DATABASE (${missing.length}) ===\n`);
    
    for (const t of missing) {
      console.log(`📁 ${t.folder}`);
      console.log(`   Guest: ${t.guest}`);
      console.log(`   Title: ${t.title}`);
      console.log(`   Content: ${t.contentLength} chars`);
      if (t.issues.length > 0) {
        console.log(`   ⚠️  Issues: ${t.issues.join(", ")}`);
      }
      console.log();
    }
  } else {
    console.log("✅ All source transcripts are in the database!");
  }

  // Report episodes with metadata issues
  console.log(`\n=== TRANSCRIPTS WITH METADATA ISSUES (${withIssues.length}) ===\n`);
  
  for (const t of withIssues) {
    const isMissing = missing.includes(t);
    console.log(`${isMissing ? "❌" : "⚠️ "} ${t.folder}`);
    console.log(`   Issues: ${t.issues.join(", ")}`);
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Total source transcripts: ${sourceTranscripts.length}`);
  console.log(`Missing from database: ${missing.length}`);
  console.log(`With metadata issues: ${withIssues.length}`);
}

main().catch(console.error);
