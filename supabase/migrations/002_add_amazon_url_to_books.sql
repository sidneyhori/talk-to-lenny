-- Add amazon_url column to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS amazon_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
