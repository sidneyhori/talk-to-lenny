/**
 * Fix Episode Guest Names
 * 
 * Updates episodes.guest_name to remove version suffixes like "2.0"
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

function getBaseName(name: string): string {
  return name.replace(/\s+\d+(\.\d+)?$/, "").trim();
}

async function main() {
  // Get all episodes
  const { data: episodes, error } = await supabase
    .from("episodes")
    .select("id, guest_name, title");

  if (error) {
    console.error("Error fetching episodes:", error);
    return;
  }

  console.log(`Checking ${episodes?.length || 0} episodes...\n`);

  let updated = 0;
  for (const episode of episodes || []) {
    const baseName = getBaseName(episode.guest_name);
    
    if (baseName !== episode.guest_name) {
      console.log(`Updating: "${episode.guest_name}" -> "${baseName}"`);
      console.log(`  Episode: ${episode.title}\n`);
      
      const { error: updateError } = await supabase
        .from("episodes")
        .update({ guest_name: baseName })
        .eq("id", episode.id);

      if (updateError) {
        console.error(`  Error: ${updateError.message}`);
      } else {
        updated++;
      }
    }
  }

  console.log(`\nUpdated ${updated} episodes.`);

  // Now update guest appearance counts
  console.log("\nRecalculating guest appearance counts...");
  
  const { data: guests } = await supabase
    .from("guests")
    .select("id, name");

  for (const guest of guests || []) {
    const { count } = await supabase
      .from("episodes")
      .select("*", { count: "exact", head: true })
      .eq("guest_name", guest.name);

    await supabase
      .from("guests")
      .update({ appearance_count: count || 0 })
      .eq("id", guest.id);
    
    console.log(`  ${guest.name}: ${count} episodes`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
