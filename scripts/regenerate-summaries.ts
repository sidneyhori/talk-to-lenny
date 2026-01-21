/**
 * Regenerate Episode Summaries
 *
 * Uses GPT-5.2 with full transcripts to create better summaries
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONCURRENCY = 5;

const SUMMARY_PROMPT = `You are summarizing a podcast episode from Lenny's Podcast (a top product management podcast).

Create a summary with this exact structure:

**Guest:** [Name] - [Current role/title]. [1 sentence on their background/credibility]

**Key Takeaways:**
- [3-5 bullet points of the most actionable insights]

**Topics Covered:** [Comma-separated list of main topics]

Guidelines:
- Be specific and actionable, not generic
- Include frameworks, mental models, or memorable quotes if mentioned
- Focus on insights listeners can apply
- Keep the whole summary under 200 words
- Use the guest's actual name and role from the transcript`;

interface Episode {
  id: string;
  title: string;
  guest_name: string;
  raw_transcript: string;
}

async function getEpisodes(): Promise<Episode[]> {
  const { data, error } = await supabase
    .from("episodes")
    .select("id, title, guest_name, raw_transcript")
    .order("publish_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function generateSummary(episode: Episode): Promise<string | null> {
  try {
    // Use full transcript but cap at ~100k chars to stay within limits
    const transcript = episode.raw_transcript.slice(0, 100000);

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using gpt-4o for reliability, gpt-5.2 if available
      messages: [
        { role: "system", content: SUMMARY_PROMPT },
        {
          role: "user",
          content: `Episode Title: ${episode.title}\n\nTranscript:\n${transcript}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error(`Error for ${episode.title}:`, (error as Error).message);
    return null;
  }
}

async function updateSummary(episodeId: string, summary: string): Promise<void> {
  const { error } = await supabase
    .from("episodes")
    .update({ summary })
    .eq("id", episodeId);

  if (error) {
    console.error(`Failed to update ${episodeId}:`, error);
  }
}

async function processInBatches(episodes: Episode[]): Promise<void> {
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < episodes.length; i += CONCURRENCY) {
    const batch = episodes.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (ep) => {
        const summary = await generateSummary(ep);
        if (summary) {
          await updateSummary(ep.id, summary);
          return true;
        }
        return false;
      })
    );

    const succeeded = results.filter(Boolean).length;
    processed += succeeded;
    errors += results.length - succeeded;

    console.log(`Progress: ${processed}/${episodes.length} (${errors} errors)`);

    // Rate limit pause
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function main() {
  console.log("Regenerating episode summaries with GPT-4o...\n");

  const episodes = await getEpisodes();
  console.log(`Found ${episodes.length} episodes to process\n`);

  // Preview first one
  console.log("Preview - generating summary for first episode...\n");
  const preview = await generateSummary(episodes[0]);
  console.log(`Title: ${episodes[0].title}`);
  console.log(`\nGenerated Summary:\n${preview}\n`);

  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("Continue with all episodes? (y/n): ", resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== "y") {
    console.log("Aborted.");
    return;
  }

  console.log("\nProcessing all episodes...\n");
  await processInBatches(episodes);
  console.log("\nDone!");
}

main().catch(console.error);
