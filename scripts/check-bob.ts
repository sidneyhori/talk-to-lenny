import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Check guest
  const { data: guest } = await supabase
    .from("guests")
    .select("*")
    .eq("name", "Bob Moesta")
    .single();
  
  console.log("Guest record:", guest);

  // Check episodes
  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, guest_name, title")
    .ilike("guest_name", "%Bob Moesta%");
  
  console.log("\nEpisodes with Bob Moesta in guest_name:");
  for (const ep of episodes || []) {
    console.log(`  - "${ep.guest_name}": ${ep.title}`);
  }

  // Check exact match
  const { data: exactEpisodes } = await supabase
    .from("episodes")
    .select("id, guest_name, title")
    .eq("guest_name", "Bob Moesta");
  
  console.log("\nEpisodes with exact match 'Bob Moesta':");
  for (const ep of exactEpisodes || []) {
    console.log(`  - ${ep.title}`);
  }
}

main().catch(console.error);
