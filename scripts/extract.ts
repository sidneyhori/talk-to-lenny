/**
 * Content Extraction Script
 *
 * Uses GPT-4o to extract:
 * - Lightning round answers (books, favorite product, life motto, etc.)
 * - Notable quotes
 * - Episode summaries
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Initialize clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface LightningRoundData {
  books_recommended: Array<{ title: string; author?: string }>;
  favorite_product: { name: string; description?: string } | null;
  life_motto: string | null;
  interview_question: string | null;
  failure_lesson: string | null;
}

interface QuoteData {
  content: string;
  topic: string;
  timestamp?: string;
}

const LIGHTNING_ROUND_PROMPT = `Analyze this podcast transcript and extract the Lightning Round answers.

Look for sections where the host asks rapid-fire questions like:
- What's a book you've recommended most?
- What's a favorite product you've recently discovered?
- What's your life motto?
- What interview question do you like to ask candidates?
- What's a recent failure and lesson learned?

Return a JSON object with this structure:
{
  "books_recommended": [{"title": "Book Title", "author": "Author Name"}],
  "favorite_product": {"name": "Product", "description": "Why they like it"} or null,
  "life_motto": "Their motto" or null,
  "interview_question": "The question" or null,
  "failure_lesson": "The lesson" or null
}

If a category isn't mentioned in the transcript, use null or empty array.
Only include information explicitly stated in the transcript.`;

const QUOTES_PROMPT = `Extract 3-5 notable quotes from this podcast transcript.

Look for:
- Memorable insights about product management, growth, leadership
- Surprising or contrarian viewpoints
- Actionable advice
- Quotable one-liners

Return a JSON array:
[
  {"content": "The exact quote", "topic": "Brief topic like 'hiring' or 'growth'", "timestamp": "if mentioned"}
]

Only include direct quotes from the guest, not the host.`;

const SUMMARY_PROMPT = `Write a concise 2-3 paragraph summary of this podcast episode.

Focus on:
- Who the guest is and their background
- The main topics discussed
- Key insights and takeaways

Keep it under 200 words and make it engaging for someone deciding whether to listen.`;

async function getEpisodesNeedingExtraction(): Promise<
  Array<{
    id: string;
    title: string;
    guest_name: string;
    raw_transcript: string;
  }>
> {
  // Get episodes without lightning rounds or summaries
  const { data, error } = await supabase
    .from("episodes")
    .select("id, title, guest_name, raw_transcript")
    .is("summary", null)
    .limit(10);

  if (error) throw error;
  return data || [];
}

async function extractLightningRound(
  transcript: string
): Promise<LightningRoundData | null> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: LIGHTNING_ROUND_PROMPT },
        { role: "user", content: transcript.slice(-30000) }, // Last ~30k chars more likely to have lightning round
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    if (!content) return null;

    return JSON.parse(content) as LightningRoundData;
  } catch (error) {
    console.error("Error extracting lightning round:", error);
    return null;
  }
}

async function extractQuotes(transcript: string): Promise<QuoteData[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: QUOTES_PROMPT },
        { role: "user", content: transcript.slice(0, 50000) }, // First ~50k chars
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    const content = response.choices[0].message.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed.quotes || [];
  } catch (error) {
    console.error("Error extracting quotes:", error);
    return [];
  }
}

async function generateSummary(
  transcript: string,
  guestName: string,
  title: string
): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SUMMARY_PROMPT },
        {
          role: "user",
          content: `Episode: ${title}\nGuest: ${guestName}\n\nTranscript:\n${transcript.slice(0, 40000)}`,
        },
      ],
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error generating summary:", error);
    return null;
  }
}

async function processEpisode(episode: {
  id: string;
  title: string;
  guest_name: string;
  raw_transcript: string;
}): Promise<void> {
  console.log(`Processing: ${episode.title}`);

  // Extract lightning round
  const lightningRound = await extractLightningRound(episode.raw_transcript);
  if (lightningRound) {
    // Check if any lightning round content was found
    const hasContent =
      lightningRound.books_recommended.length > 0 ||
      lightningRound.favorite_product ||
      lightningRound.life_motto ||
      lightningRound.interview_question ||
      lightningRound.failure_lesson;

    if (hasContent) {
      await supabase.from("lightning_rounds").upsert({
        episode_id: episode.id,
        books_recommended: lightningRound.books_recommended,
        favorite_product: lightningRound.favorite_product,
        life_motto: lightningRound.life_motto,
        interview_question: lightningRound.interview_question,
        failure_lesson: lightningRound.failure_lesson,
      });

      // Also update books table
      for (const book of lightningRound.books_recommended) {
        await supabase.from("books").upsert(
          {
            title: book.title,
            author: book.author || null,
            recommendation_count: 1,
            recommenders: [episode.guest_name],
          },
          {
            onConflict: "title,author",
          }
        );
      }
    }
  }

  // Extract quotes
  const quotes = await extractQuotes(episode.raw_transcript);
  if (quotes.length > 0) {
    // Get guest ID
    const { data: guest } = await supabase
      .from("guests")
      .select("id")
      .eq("name", episode.guest_name)
      .single();

    const quoteInserts = quotes.map((q) => ({
      episode_id: episode.id,
      guest_id: guest?.id || null,
      content: q.content,
      topic: q.topic,
      timestamp: q.timestamp || null,
      is_featured: false,
    }));

    await supabase.from("quotes").insert(quoteInserts);
  }

  // Generate summary
  const summary = await generateSummary(
    episode.raw_transcript,
    episode.guest_name,
    episode.title
  );

  if (summary) {
    await supabase
      .from("episodes")
      .update({ summary })
      .eq("id", episode.id);
  }

  console.log(
    `  - Lightning round: ${lightningRound ? "Yes" : "No"}, Quotes: ${quotes.length}, Summary: ${summary ? "Yes" : "No"}`
  );
}

async function main() {
  console.log("Starting content extraction...\n");

  let processed = 0;

  while (true) {
    const episodes = await getEpisodesNeedingExtraction();

    if (episodes.length === 0) {
      console.log("No more episodes to process!");
      break;
    }

    for (const episode of episodes) {
      await processEpisode(episode);
      processed++;

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log(`\nProcessed ${processed} episodes so far...`);
  }

  console.log(`\nExtraction complete! Total processed: ${processed}`);
}

main().catch(console.error);
