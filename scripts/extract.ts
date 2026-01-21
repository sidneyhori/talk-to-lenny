/**
 * Content Extraction Script (Optimized)
 *
 * Uses GPT-4o-mini to extract in parallel:
 * - Lightning round answers (books, favorite product, life motto, etc.)
 * - Notable quotes
 * - Episode summaries
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Initialize clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openaiKey });

// Use faster model
const MODEL = "gpt-4o-mini";
const CONCURRENCY = 10; // Process 10 episodes in parallel

interface ExtractionResult {
  lightning_round: {
    books_recommended: Array<{ title: string; author?: string }>;
    favorite_product: { name: string; description?: string } | null;
    life_motto: string | null;
    interview_question: string | null;
  };
  quotes: Array<{ content: string; topic: string }>;
  summary: string;
}

const COMBINED_PROMPT = `Analyze this podcast transcript and extract the following in JSON format:

{
  "lightning_round": {
    "books_recommended": [{"title": "Book", "author": "Author"}],
    "favorite_product": {"name": "Product", "description": "Why"} or null,
    "life_motto": "motto" or null,
    "interview_question": "question" or null
  },
  "quotes": [
    {"content": "Notable quote from guest", "topic": "brief topic"}
  ],
  "summary": "2-3 sentence summary of episode focusing on key insights"
}

Guidelines:
- Lightning round: Look for rapid-fire Q&A section (books, products, mottos)
- Quotes: Extract 2-3 memorable insights from the GUEST only
- Summary: Brief overview of who the guest is and main takeaways

Only include what's explicitly in the transcript. Use null/empty arrays if not found.`;

async function getEpisodesNeedingExtraction(): Promise<
  Array<{
    id: string;
    title: string;
    guest_name: string;
    raw_transcript: string;
  }>
> {
  const { data, error } = await supabase
    .from("episodes")
    .select("id, title, guest_name, raw_transcript")
    .is("summary", null)
    .limit(50);

  if (error) throw error;
  return data || [];
}

async function extractAll(
  transcript: string,
  title: string,
  guestName: string
): Promise<ExtractionResult | null> {
  try {
    // Take beginning and end of transcript (lightning round usually at end)
    const maxLen = 20000;
    let truncated = transcript;
    if (transcript.length > maxLen) {
      const start = transcript.slice(0, maxLen / 2);
      const end = transcript.slice(-maxLen / 2);
      truncated = start + "\n\n[...middle truncated...]\n\n" + end;
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: COMBINED_PROMPT },
        {
          role: "user",
          content: `Episode: ${title}\nGuest: ${guestName}\n\n${truncated}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0].message.content;
    if (!content) return null;

    return JSON.parse(content) as ExtractionResult;
  } catch (error) {
    console.error(`Error extracting ${title}:`, (error as Error).message);
    return null;
  }
}

async function processEpisode(episode: {
  id: string;
  title: string;
  guest_name: string;
  raw_transcript: string;
}): Promise<boolean> {
  const result = await extractAll(
    episode.raw_transcript,
    episode.title,
    episode.guest_name
  );

  if (!result) return false;

  // Save lightning round
  const lr = result.lightning_round;
  if (lr && (lr.books_recommended?.length || lr.favorite_product || lr.life_motto)) {
    await supabase.from("lightning_rounds").upsert({
      episode_id: episode.id,
      books_recommended: lr.books_recommended || [],
      favorite_product: lr.favorite_product,
      life_motto: lr.life_motto,
      interview_question: lr.interview_question,
    });

    // Update books table
    for (const book of lr.books_recommended || []) {
      await supabase.from("books").upsert(
        {
          title: book.title,
          author: book.author || null,
          recommendation_count: 1,
          recommenders: [episode.guest_name],
        },
        { onConflict: "title,author" }
      );
    }
  }

  // Save quotes
  if (result.quotes?.length) {
    const { data: guest } = await supabase
      .from("guests")
      .select("id")
      .eq("name", episode.guest_name)
      .single();

    await supabase.from("quotes").insert(
      result.quotes.map((q) => ({
        episode_id: episode.id,
        guest_id: guest?.id || null,
        content: q.content,
        topic: q.topic,
        is_featured: false,
      }))
    );
  }

  // Save summary
  if (result.summary) {
    await supabase
      .from("episodes")
      .update({ summary: result.summary })
      .eq("id", episode.id);
  }

  return true;
}

async function processInParallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);

    if (i + concurrency < items.length) {
      // Brief pause between batches
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

async function main() {
  console.log("Starting optimized content extraction...");
  console.log(`Using model: ${MODEL}, concurrency: ${CONCURRENCY}\n`);

  let totalProcessed = 0;

  while (true) {
    const episodes = await getEpisodesNeedingExtraction();

    if (episodes.length === 0) {
      console.log("No more episodes to process!");
      break;
    }

    console.log(`Processing batch of ${episodes.length} episodes...`);

    const results = await processInParallel(
      episodes,
      async (ep) => {
        const success = await processEpisode(ep);
        process.stdout.write(success ? "." : "x");
        return success;
      },
      CONCURRENCY
    );

    const succeeded = results.filter(Boolean).length;
    totalProcessed += succeeded;
    console.log(`\n  Batch done: ${succeeded}/${episodes.length} succeeded`);
    console.log(`  Total processed: ${totalProcessed}\n`);
  }

  console.log(`\nExtraction complete! Total: ${totalProcessed}`);
}

main().catch(console.error);
