/**
 * Merge Duplicate Guests Script
 *
 * This script identifies and merges duplicate guest entries that represent
 * the same person (e.g., "Bob Moesta" and "Bob Moesta 2.0").
 *
 * Usage:
 *   npx ts-node scripts/merge-guests.ts           # Dry run (preview changes)
 *   npx ts-node scripts/merge-guests.ts --execute # Actually make changes
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

interface Guest {
  id: string;
  name: string;
  slug: string;
  appearance_count: number;
}

interface GuestGroup {
  baseName: string;
  canonical: Guest;
  duplicates: Guest[];
}

/**
 * Get the base name by removing version suffixes like "2.0", "2", etc.
 */
function getBaseName(name: string): string {
  return name.replace(/\s+\d+(\.\d+)?$/, "").trim();
}

/**
 * Create a slug from a name
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/**
 * Find all guests and group duplicates by base name
 */
async function findDuplicateGroups(): Promise<GuestGroup[]> {
  const { data: guests, error } = await supabase
    .from("guests")
    .select("id, name, slug, appearance_count")
    .order("name");

  if (error) {
    throw new Error(`Failed to fetch guests: ${error.message}`);
  }

  if (!guests || guests.length === 0) {
    return [];
  }

  // Group guests by base name
  const groups = new Map<string, Guest[]>();

  for (const guest of guests as Guest[]) {
    const baseName = getBaseName(guest.name);
    const existing = groups.get(baseName) || [];
    existing.push(guest);
    groups.set(baseName, existing);
  }

  // Filter to only groups with duplicates and identify canonical
  const duplicateGroups: GuestGroup[] = [];

  for (const [baseName, guestList] of groups) {
    if (guestList.length > 1) {
      // Sort to prefer the name without suffix (shorter name) as canonical
      guestList.sort((a, b) => a.name.length - b.name.length);

      const canonical = guestList[0];
      const duplicates = guestList.slice(1);

      duplicateGroups.push({
        baseName,
        canonical,
        duplicates,
      });
    }
  }

  return duplicateGroups;
}

/**
 * Preview the changes that would be made
 */
async function previewChanges(groups: GuestGroup[]): Promise<void> {
  console.log("\n=== DUPLICATE GUESTS FOUND ===\n");

  for (const group of groups) {
    console.log(`Base Name: "${group.baseName}"`);
    console.log(`  Canonical: "${group.canonical.name}" (${group.canonical.appearance_count} episodes)`);
    console.log(`  Duplicates to merge:`);
    for (const dup of group.duplicates) {
      console.log(`    - "${dup.name}" (${dup.appearance_count} episodes)`);
    }
    console.log();
  }

  // Show what would be updated
  console.log("=== CHANGES TO BE MADE ===\n");

  for (const group of groups) {
    for (const dup of group.duplicates) {
      // Check episodes that would be updated
      const { data: episodes } = await supabase
        .from("episodes")
        .select("id, title")
        .eq("guest_name", dup.name);

      if (episodes && episodes.length > 0) {
        console.log(`Episodes to update (${dup.name} -> ${group.canonical.name}):`);
        for (const ep of episodes) {
          console.log(`  - ${ep.title}`);
        }
      }

      // Check quotes that would be updated
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id, content")
        .eq("guest_id", dup.id);

      if (quotes && quotes.length > 0) {
        console.log(`Quotes to reassign: ${quotes.length}`);
      }
    }
    console.log();
  }
}

/**
 * Execute the merge for all duplicate groups
 */
async function executeMerge(groups: GuestGroup[]): Promise<void> {
  console.log("\n=== EXECUTING MERGE ===\n");

  for (const group of groups) {
    console.log(`Merging "${group.baseName}"...`);

    for (const dup of group.duplicates) {
      // 1. Update episodes.guest_name
      const { error: episodeError, count: episodeCount } = await supabase
        .from("episodes")
        .update({ guest_name: group.canonical.name })
        .eq("guest_name", dup.name);

      if (episodeError) {
        console.error(`  Error updating episodes: ${episodeError.message}`);
        continue;
      }
      console.log(`  Updated ${episodeCount || 0} episodes from "${dup.name}"`);

      // 2. Update quotes.guest_id
      const { error: quotesError, count: quotesCount } = await supabase
        .from("quotes")
        .update({ guest_id: group.canonical.id })
        .eq("guest_id", dup.id);

      if (quotesError) {
        console.error(`  Error updating quotes: ${quotesError.message}`);
      } else {
        console.log(`  Reassigned ${quotesCount || 0} quotes`);
      }

      // 3. Delete duplicate guest
      const { error: deleteError } = await supabase
        .from("guests")
        .delete()
        .eq("id", dup.id);

      if (deleteError) {
        console.error(`  Error deleting duplicate guest: ${deleteError.message}`);
      } else {
        console.log(`  Deleted duplicate guest "${dup.name}"`);
      }
    }

    // 4. Recalculate appearance_count for canonical guest
    const { count: episodeCount } = await supabase
      .from("episodes")
      .select("*", { count: "exact", head: true })
      .eq("guest_name", group.canonical.name);

    const { error: updateError } = await supabase
      .from("guests")
      .update({ appearance_count: episodeCount || 1 })
      .eq("id", group.canonical.id);

    if (updateError) {
      console.error(`  Error updating appearance count: ${updateError.message}`);
    } else {
      console.log(`  Updated appearance count to ${episodeCount}`);
    }

    console.log();
  }
}

async function main() {
  const executeFlag = process.argv.includes("--execute");

  console.log("Scanning for duplicate guests...\n");

  const groups = await findDuplicateGroups();

  if (groups.length === 0) {
    console.log("No duplicate guests found!");
    return;
  }

  console.log(`Found ${groups.length} group(s) of duplicate guests.\n`);

  await previewChanges(groups);

  if (executeFlag) {
    await executeMerge(groups);
    console.log("Merge complete!");
  } else {
    console.log("\n=== DRY RUN ===");
    console.log("No changes were made. Run with --execute to apply changes:");
    console.log("  npx ts-node scripts/merge-guests.ts --execute");
  }
}

main().catch(console.error);
