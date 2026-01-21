/**
 * Embedding Generation Script
 *
 * This script generates embeddings for all chunks using OpenAI's
 * text-embedding-3-small model and stores them in Supabase.
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
  console.error("Missing environment variables. Please set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const openai = new OpenAI({
  apiKey: openaiKey,
});

const BATCH_SIZE = 50; // Process 50 chunks at a time
const EMBEDDING_MODEL = "text-embedding-3-small";

async function getChunksWithoutEmbeddings(): Promise<
  Array<{ id: string; content: string }>
> {
  const { data, error } = await supabase
    .from("chunks")
    .select("id, content")
    .is("embedding", null)
    .limit(BATCH_SIZE);

  if (error) {
    throw error;
  }

  return data || [];
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    // Truncate text if too long (rough estimate: 4 chars per token, limit is ~8000 tokens)
    const maxChars = 30000;
    const truncatedText = text.length > maxChars ? text.slice(0, maxChars) : text;

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: truncatedText,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", (error as Error).message);
    return null;
  }
}

async function updateChunkEmbeddings(
  chunks: Array<{ id: string; embedding: number[] }>
): Promise<void> {
  // Update chunks one at a time (Supabase doesn't support bulk update with different values)
  for (const chunk of chunks) {
    const { error } = await supabase
      .from("chunks")
      .update({ embedding: chunk.embedding as unknown as string })
      .eq("id", chunk.id);

    if (error) {
      console.error(`Error updating chunk ${chunk.id}:`, error);
    }
  }
}

async function countTotalChunks(): Promise<{
  total: number;
  withEmbeddings: number;
}> {
  const { count: total } = await supabase
    .from("chunks")
    .select("*", { count: "exact", head: true });

  const { count: withEmbeddings } = await supabase
    .from("chunks")
    .select("*", { count: "exact", head: true })
    .not("embedding", "is", null);

  return {
    total: total || 0,
    withEmbeddings: withEmbeddings || 0,
  };
}

async function main() {
  console.log("Starting embedding generation...\n");

  const { total, withEmbeddings } = await countTotalChunks();
  console.log(`Total chunks: ${total}`);
  console.log(`Already embedded: ${withEmbeddings}`);
  console.log(`To process: ${total - withEmbeddings}\n`);

  let processed = 0;
  let errors = 0;

  while (true) {
    // Get next batch of chunks without embeddings
    const chunks = await getChunksWithoutEmbeddings();

    if (chunks.length === 0) {
      console.log("No more chunks to process!");
      break;
    }

    console.log(`Processing batch of ${chunks.length} chunks...`);

    // Process each chunk individually to avoid token limits
    const updates: Array<{ id: string; embedding: number[] }> = [];

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk.content);

      if (embedding) {
        updates.push({
          id: chunk.id,
          embedding: embedding,
        });
      } else {
        errors++;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Update database
    await updateChunkEmbeddings(updates);
    processed += updates.length;

    console.log(`  Processed: ${processed}, Errors: ${errors}`);

    // Brief pause between batches
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`\nEmbedding generation complete!`);
  console.log(`Total processed: ${processed}`);
  console.log(`Total errors: ${errors}`);
}

main().catch(console.error);
