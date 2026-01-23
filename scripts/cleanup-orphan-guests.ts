/**
 * Cleanup Orphan Guests
 * 
 * Removes guest entries that have no associated episodes (appearance_count = 0)
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

async function main() {
  const executeFlag = process.argv.includes("--execute");

  // Find guests with 0 episodes
  const { data: orphanGuests, error } = await supabase
    .from("guests")
    .select("id, name, slug, appearance_count")
    .eq("appearance_count", 0);

  if (error) {
    console.error("Error fetching guests:", error);
    return;
  }

  if (!orphanGuests || orphanGuests.length === 0) {
    console.log("No orphan guests found!");
    return;
  }

  console.log(`Found ${orphanGuests.length} guest(s) with no episodes:\n`);
  
  for (const guest of orphanGuests) {
    console.log(`  - "${guest.name}" (slug: ${guest.slug})`);
    
    // Check if there's a similar episode that might match
    const { data: similarEpisodes } = await supabase
      .from("episodes")
      .select("guest_name, title")
      .ilike("guest_name", `%${guest.name.split(" ")[0]}%`)
      .limit(3);
    
    if (similarEpisodes && similarEpisodes.length > 0) {
      console.log(`    Possible matches:`);
      for (const ep of similarEpisodes) {
        console.log(`      "${ep.guest_name}": ${ep.title}`);
      }
    }
  }

  if (executeFlag) {
    console.log("\n=== DELETING ORPHAN GUESTS ===\n");
    
    for (const guest of orphanGuests) {
      // First, update any quotes that reference this guest
      const { error: quotesError } = await supabase
        .from("quotes")
        .update({ guest_id: null })
        .eq("guest_id", guest.id);
      
      if (quotesError) {
        console.error(`  Error clearing quotes for ${guest.name}: ${quotesError.message}`);
      }

      // Delete the guest
      const { error: deleteError } = await supabase
        .from("guests")
        .delete()
        .eq("id", guest.id);

      if (deleteError) {
        console.error(`  Error deleting ${guest.name}: ${deleteError.message}`);
      } else {
        console.log(`  Deleted: "${guest.name}"`);
      }
    }
    
    console.log("\nCleanup complete!");
  } else {
    console.log("\n=== DRY RUN ===");
    console.log("No changes were made. Run with --execute to delete orphan guests:");
    console.log("  npx ts-node scripts/cleanup-orphan-guests.ts --execute");
  }
}

main().catch(console.error);
