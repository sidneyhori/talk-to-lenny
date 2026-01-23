/**
 * Book Enrichment Script
 *
 * Finds Amazon links and missing authors for books in the database.
 * Uses Google Books API (free, no key required for basic searches) to get book info,
 * then constructs Amazon search URLs.
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
      industryIdentifiers?: Array<{
        type: string;
        identifier: string;
      }>;
    };
  }>;
}

// Delay helper
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Search Google Books API for book information
 */
async function searchGoogleBooks(
  title: string,
  author: string | null
): Promise<{ author: string | null; isbn: string | null }> {
  try {
    const query = author ? `intitle:${title}+inauthor:${author}` : `intitle:${title}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`;

    const response = await fetch(url);
    if (!response.ok) {
      return { author: null, isbn: null };
    }

    const data: GoogleBooksResponse = await response.json();

    if (!data.items || data.items.length === 0) {
      return { author: null, isbn: null };
    }

    const bookInfo = data.items[0].volumeInfo;

    // Get author if we don't have one
    const foundAuthor = bookInfo.authors?.[0] || null;

    // Get ISBN for better Amazon link
    const isbn =
      bookInfo.industryIdentifiers?.find((id) => id.type === "ISBN_13")?.identifier ||
      bookInfo.industryIdentifiers?.find((id) => id.type === "ISBN_10")?.identifier ||
      null;

    return { author: foundAuthor, isbn };
  } catch (error) {
    console.error(`Error searching Google Books for "${title}":`, (error as Error).message);
    return { author: null, isbn: null };
  }
}

/**
 * Generate Amazon search URL for a book
 */
function generateAmazonUrl(title: string, author: string | null): string {
  // Always use search URL - it's more reliable than trying to guess ASINs
  const searchQuery = author ? `${title} ${author}` : title;
  return `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}&i=stripbooks`;
}

/**
 * Get all books that need enrichment (missing amazon_url or author)
 */
async function getBooksToEnrich(): Promise<Book[]> {
  // Get books missing amazon_url
  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, amazon_url")
    .is("amazon_url", null)
    .order("recommendation_count", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as Book[]) || [];
}

/**
 * Update a book with enriched data
 */
async function updateBook(
  id: string,
  updates: { author?: string; amazon_url?: string }
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
  console.log("Starting book enrichment...\n");

  const books = await getBooksToEnrich();
  console.log(`Found ${books.length} books to process.\n`);

  let updatedCount = 0;
  let authorsFound = 0;
  let amazonLinksAdded = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const needsAuthor = !book.author;
    const needsAmazonUrl = !book.amazon_url;

    if (!needsAuthor && !needsAmazonUrl) {
      continue;
    }

    console.log(`[${i + 1}/${books.length}] Processing: "${book.title}"${book.author ? ` by ${book.author}` : ""}`);

    // Search Google Books for additional info
    const { author: foundAuthor, isbn } = await searchGoogleBooks(book.title, book.author);

    const updates: { author?: string; amazon_url?: string } = {};

    // Update author if we found one and didn't have one
    if (needsAuthor && foundAuthor) {
      updates.author = foundAuthor;
      authorsFound++;
      console.log(`  → Found author: ${foundAuthor}`);
    }

    // Generate Amazon URL
    if (needsAmazonUrl) {
      const amazonUrl = generateAmazonUrl(
        book.title,
        updates.author || book.author
      );
      updates.amazon_url = amazonUrl;
      amazonLinksAdded++;
      console.log(`  → Added Amazon link`);
    }

    // Update database if we have changes
    if (Object.keys(updates).length > 0) {
      const success = await updateBook(book.id, updates);
      if (success) {
        updatedCount++;
      }
    }

    // Rate limit to avoid hitting API limits
    await delay(200);
  }

  console.log("\n" + "=".repeat(50));
  console.log("Enrichment complete!");
  console.log(`  Books updated: ${updatedCount}`);
  console.log(`  Authors found: ${authorsFound}`);
  console.log(`  Amazon links added: ${amazonLinksAdded}`);
}

main().catch(console.error);
