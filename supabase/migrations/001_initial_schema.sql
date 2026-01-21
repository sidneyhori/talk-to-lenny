-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Episodes table
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_name TEXT NOT NULL,
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  video_id TEXT,
  publish_date DATE NOT NULL,
  description TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  keywords TEXT[] DEFAULT '{}',
  raw_transcript TEXT NOT NULL,
  summary TEXT,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guests table
CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  bio TEXT,
  companies TEXT[] DEFAULT '{}',
  roles TEXT[] DEFAULT '{}',
  appearance_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chunks table for RAG
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_timestamp TEXT,
  end_timestamp TEXT,
  speaker TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lightning rounds table
CREATE TABLE lightning_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL UNIQUE REFERENCES episodes(id) ON DELETE CASCADE,
  books_recommended JSONB DEFAULT '[]',
  favorite_product JSONB,
  life_motto TEXT,
  interview_question TEXT,
  failure_lesson TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Books table
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT,
  recommendation_count INTEGER NOT NULL DEFAULT 1,
  recommenders TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(title, author)
);

-- Quotes table
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  timestamp TEXT,
  topic TEXT,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Topics table
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  episode_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Companies table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  mention_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Junction table: episodes <-> topics
CREATE TABLE episode_topics (
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (episode_id, topic_id)
);

-- Junction table: guests <-> companies
CREATE TABLE guest_companies (
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT,
  PRIMARY KEY (guest_id, company_id)
);

-- Indexes for performance
CREATE INDEX idx_episodes_slug ON episodes(slug);
CREATE INDEX idx_episodes_publish_date ON episodes(publish_date DESC);
CREATE INDEX idx_episodes_guest_name ON episodes(guest_name);
CREATE INDEX idx_chunks_episode_id ON chunks(episode_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_guests_slug ON guests(slug);
CREATE INDEX idx_quotes_episode_id ON quotes(episode_id);
CREATE INDEX idx_quotes_is_featured ON quotes(is_featured) WHERE is_featured = true;
CREATE INDEX idx_topics_slug ON topics(slug);

-- Function to match chunks by semantic similarity
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_episode_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  episode_id uuid,
  content text,
  chunk_index int,
  start_timestamp text,
  speaker text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.episode_id,
    c.content,
    c.chunk_index,
    c.start_timestamp,
    c.speaker,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c
  WHERE
    c.embedding IS NOT NULL
    AND (filter_episode_id IS NULL OR c.episode_id = filter_episode_id)
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to episodes
CREATE TRIGGER update_episodes_updated_at
  BEFORE UPDATE ON episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
