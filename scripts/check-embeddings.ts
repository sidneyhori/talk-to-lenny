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
  // Get the new episode IDs
  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, title, guest_name")
    .or("guest_name.eq.Daniel Lereya,guest_name.eq.Peter Deng");

  console.log("New episodes:");
  for (const ep of episodes || []) {
    console.log("  -", ep.guest_name, ":", ep.id);
  }

  const episodeIds = (episodes || []).map((e) => e.id);

  // Check chunks table
  const { count } = await supabase
    .from("chunks")
    .select("*", { count: "exact", head: true })
    .in("episode_id", episodeIds);

  console.log("\nChunks for new episodes:", count || 0);

  // Total chunks
  const { count: totalChunks } = await supabase
    .from("chunks")
    .select("*", { count: "exact", head: true });

  console.log("Total chunks in DB:", totalChunks);

  // Episodes without chunks
  const { data: allEpisodes } = await supabase
    .from("episodes")
    .select("id, guest_name");

  let missingCount = 0;
  for (const ep of allEpisodes || []) {
    const { count: epChunks } = await supabase
      .from("chunks")
      .select("*", { count: "exact", head: true })
      .eq("episode_id", ep.id);

    if (!epChunks || epChunks === 0) {
      missingCount++;
      if (missingCount <= 5) {
        console.log("  Missing chunks:", ep.guest_name);
      }
    }
  }

  console.log("\nTotal episodes without chunks:", missingCount);
}

main().catch(console.error);
