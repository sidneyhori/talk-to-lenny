/**
 * Fix Book Links Script
 *
 * Fixes dead Amazon book links caused by "Unknown" author in search query.
 * Looks up correct author via Google Books API, updates the database,
 * and regenerates Amazon URLs without "Unknown".
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

interface Book {
  id: string;
  title: string;
  author: string | null;
  amazon_url: string | null;
}

interface GoogleBooksResponse {
  items?: Array<{
    volumeInfo: {
      title: string;
      authors?: string[];
    };
  }>;
}

// Delay helper
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Search Google Books API for book author
 */
async function searchGoogleBooks(title: string): Promise<string | null> {
  try {
    // Search by title only (don't include "Unknown" author)
    const query = `intitle:${title}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`;

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data: GoogleBooksResponse = await response.json();

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const bookInfo = data.items[0].volumeInfo;
    return bookInfo.authors?.[0] || null;
  } catch (error) {
    console.error(`Error searching Google Books for "${title}":`, (error as Error).message);
    return null;
  }
}

/**
 * Generate Amazon search URL for a book
 */
function generateAmazonUrl(title: string, author: string | null): string {
  // Only include author if it's a real name (not "Unknown")
  const searchQuery = author ? `${title} ${author}` : title;
  return `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}&i=stripbooks`;
}

/**
 * Get all books with "Unknown" author
 */
async function getBooksWithUnknownAuthor(): Promise<Book[]> {
  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, amazon_url")
    .ilike("author", "%unknown%")
    .order("recommendation_count", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as Book[]) || [];
}

/**
 * Update a book with fixed data
 */
async function updateBook(
  id: string,
  updates: { author: string | null; amazon_url: string }
): Promise<boolean> {
  const { error } = await supabase.from("books").update(updates).eq("id", id);

  if (error) {
    // Handle unique constraint violation - just update amazon_url without author
    if (error.code === "23505" && updates.author && updates.amazon_url) {
      const { error: retryError } = await supabase
        .from("books")
        .update({ amazon_url: updates.amazon_url })
        .eq("id", id);

      if (retryError) {
        console.error(`  ✗ Error updating: ${retryError.message}`);
        return false;
      }
      return true;
    }

    console.error(`  ✗ Error updating: ${error.message}`);
    return false;
  }
  return true;
}

async function main() {
  console.log("Fixing books with 'Unknown' author...\n");

  const books = await getBooksWithUnknownAuthor();
  console.log(`Found ${books.length} books with "Unknown" author.\n`);

  if (books.length === 0) {
    console.log("No books to fix!");
    return;
  }

  let updatedCount = 0;
  let authorsFound = 0;
  let authorsSetToNull = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];

    console.log(`[${i + 1}/${books.length}] Processing: "${book.title}"`);

    // Search Google Books for the correct author
    const foundAuthor = await searchGoogleBooks(book.title);

    // Determine new author value (real author or NULL, never "Unknown")
    const newAuthor = foundAuthor || null;

    // Generate new Amazon URL (without "Unknown")
    const newAmazonUrl = generateAmazonUrl(book.title, newAuthor);

    if (foundAuthor) {
      authorsFound++;
      console.log(`  → Found author: ${foundAuthor}`);
    } else {
      authorsSetToNull++;
      console.log(`  → No author found, setting to NULL`);
    }

    // Update database
    const success = await updateBook(book.id, {
      author: newAuthor,
      amazon_url: newAmazonUrl,
    });

    if (success) {
      updatedCount++;
    }

    // Rate limit to avoid hitting API limits
    await delay(200);
  }

  console.log("\n" + "=".repeat(50));
  console.log("Fix complete!");
  console.log(`  Books updated: ${updatedCount}`);
  console.log(`  Authors found via Google Books: ${authorsFound}`);
  console.log(`  Authors set to NULL: ${authorsSetToNull}`);

  // Verification query
  console.log("\n" + "=".repeat(50));
  console.log("Verification:");
  const { count } = await supabase
    .from("books")
    .select("*", { count: "exact", head: true })
    .ilike("author", "%unknown%");

  console.log(`  Books still with "Unknown" author: ${count || 0}`);
}

main().catch(console.error);
