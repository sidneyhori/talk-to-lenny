export interface Database {
  public: {
    Tables: {
      episodes: {
        Row: {
          id: string;
          guest_name: string;
          title: string;
          youtube_url: string;
          video_id: string | null;
          publish_date: string;
          description: string | null;
          duration_seconds: number;
          view_count: number;
          keywords: string[];
          raw_transcript: string;
          summary: string | null;
          slug: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          guest_name: string;
          title: string;
          youtube_url: string;
          video_id?: string | null;
          publish_date: string;
          description?: string | null;
          duration_seconds: number;
          view_count?: number;
          keywords?: string[];
          raw_transcript: string;
          summary?: string | null;
          slug: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          guest_name?: string;
          title?: string;
          youtube_url?: string;
          video_id?: string | null;
          publish_date?: string;
          description?: string | null;
          duration_seconds?: number;
          view_count?: number;
          keywords?: string[];
          raw_transcript?: string;
          summary?: string | null;
          slug?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      guests: {
        Row: {
          id: string;
          name: string;
          slug: string;
          bio: string | null;
          companies: string[];
          roles: string[];
          appearance_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          bio?: string | null;
          companies?: string[];
          roles?: string[];
          appearance_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          bio?: string | null;
          companies?: string[];
          roles?: string[];
          appearance_count?: number;
          created_at?: string;
        };
      };
      chunks: {
        Row: {
          id: string;
          episode_id: string;
          content: string;
          chunk_index: number;
          start_timestamp: string | null;
          end_timestamp: string | null;
          speaker: string | null;
          token_count: number;
          embedding: number[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          content: string;
          chunk_index: number;
          start_timestamp?: string | null;
          end_timestamp?: string | null;
          speaker?: string | null;
          token_count: number;
          embedding?: number[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          content?: string;
          chunk_index?: number;
          start_timestamp?: string | null;
          end_timestamp?: string | null;
          speaker?: string | null;
          token_count?: number;
          embedding?: number[] | null;
          created_at?: string;
        };
      };
      lightning_rounds: {
        Row: {
          id: string;
          episode_id: string;
          books_recommended: {
            title: string;
            author?: string;
          }[];
          favorite_product: {
            name: string;
            description?: string;
          } | null;
          life_motto: string | null;
          interview_question: string | null;
          failure_lesson: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          books_recommended?: {
            title: string;
            author?: string;
          }[];
          favorite_product?: {
            name: string;
            description?: string;
          } | null;
          life_motto?: string | null;
          interview_question?: string | null;
          failure_lesson?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          books_recommended?: {
            title: string;
            author?: string;
          }[];
          favorite_product?: {
            name: string;
            description?: string;
          } | null;
          life_motto?: string | null;
          interview_question?: string | null;
          failure_lesson?: string | null;
          created_at?: string;
        };
      };
      books: {
        Row: {
          id: string;
          title: string;
          author: string | null;
          amazon_url: string | null;
          recommendation_count: number;
          recommenders: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          author?: string | null;
          amazon_url?: string | null;
          recommendation_count?: number;
          recommenders?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          author?: string | null;
          amazon_url?: string | null;
          recommendation_count?: number;
          recommenders?: string[];
          created_at?: string;
        };
      };
      quotes: {
        Row: {
          id: string;
          episode_id: string;
          guest_id: string | null;
          content: string;
          timestamp: string | null;
          topic: string | null;
          is_featured: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          guest_id?: string | null;
          content: string;
          timestamp?: string | null;
          topic?: string | null;
          is_featured?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          guest_id?: string | null;
          content?: string;
          timestamp?: string | null;
          topic?: string | null;
          is_featured?: boolean;
          created_at?: string;
        };
      };
      topics: {
        Row: {
          id: string;
          name: string;
          slug: string;
          episode_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          episode_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          episode_count?: number;
          created_at?: string;
        };
      };
      companies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          mention_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          mention_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          mention_count?: number;
          created_at?: string;
        };
      };
      episode_topics: {
        Row: {
          episode_id: string;
          topic_id: string;
        };
        Insert: {
          episode_id: string;
          topic_id: string;
        };
        Update: {
          episode_id?: string;
          topic_id?: string;
        };
      };
      guest_companies: {
        Row: {
          guest_id: string;
          company_id: string;
          role: string | null;
        };
        Insert: {
          guest_id: string;
          company_id: string;
          role?: string | null;
        };
        Update: {
          guest_id?: string;
          company_id?: string;
          role?: string | null;
        };
      };
    };
    Functions: {
      match_chunks: {
        Args: {
          query_embedding: number[];
          match_threshold: number;
          match_count: number;
          filter_episode_id?: string;
        };
        Returns: {
          id: string;
          episode_id: string;
          content: string;
          chunk_index: number;
          start_timestamp: string | null;
          speaker: string | null;
          similarity: number;
        }[];
      };
    };
  };
}

export type Episode = Database["public"]["Tables"]["episodes"]["Row"];
export type Guest = Database["public"]["Tables"]["guests"]["Row"];
export type Chunk = Database["public"]["Tables"]["chunks"]["Row"];
export type LightningRound =
  Database["public"]["Tables"]["lightning_rounds"]["Row"];
export type Book = Database["public"]["Tables"]["books"]["Row"];
export type Quote = Database["public"]["Tables"]["quotes"]["Row"];
export type Topic = Database["public"]["Tables"]["topics"]["Row"];
export type Company = Database["public"]["Tables"]["companies"]["Row"];
