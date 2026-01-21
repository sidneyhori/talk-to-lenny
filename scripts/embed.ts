/**
 * Embedding Generation Script
 *
 * This script generates embeddings for all chunks using OpenAI's
 * text-embedding-3-small model and stores them in Supabase.
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

const BATCH_SIZE = 100; // Process 100 chunks at a time
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

async function generateEmbeddings(
  texts: string[]
): Promise<Array<number[] | null>> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error("Error generating embeddings:", error);
    return texts.map(() => null);
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

    // Generate embeddings
    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts);

    // Filter out failures and prepare updates
    const updates: Array<{ id: string; embedding: number[] }> = [];
    for (let i = 0; i < chunks.length; i++) {
      if (embeddings[i]) {
        updates.push({
          id: chunks[i].id,
          embedding: embeddings[i]!,
        });
      } else {
        errors++;
      }
    }

    // Update database
    await updateChunkEmbeddings(updates);
    processed += updates.length;

    console.log(`  Processed: ${processed}, Errors: ${errors}`);

    // Rate limiting - wait a bit between batches
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\nEmbedding generation complete!`);
  console.log(`Total processed: ${processed}`);
  console.log(`Total errors: ${errors}`);
}

main().catch(console.error);
