export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Quote, ExternalLink } from "lucide-react";

interface SearchParams {
  topic?: string;
  page?: string;
}

interface QuoteWithEpisode {
  id: string;
  content: string;
  topic: string | null;
  timestamp: string | null;
  is_featured: boolean;
  episodes: { title: string; slug: string; guest_name: string } | null;
}

interface TopicRow {
  topic: string | null;
}

async function getQuotes(params: SearchParams) {
  const page = parseInt(params.page || "1");
  const perPage = 20;
  const offset = (page - 1) * perPage;

  let query = supabase
    .from("quotes")
    .select(
      `
      id,
      content,
      topic,
      timestamp,
      is_featured,
      episodes(title, slug, guest_name)
    `,
      { count: "exact" }
    )
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (params.topic) {
    query = query.eq("topic", params.topic);
  }

  query = query.range(offset, offset + perPage - 1);

  const { data, count } = await query;

  return {
    quotes: (data as QuoteWithEpisode[]) || [],
    total: count || 0,
    page,
    perPage,
    totalPages: Math.ceil((count || 0) / perPage),
  };
}

async function getTopics(): Promise<string[]> {
  const { data } = await supabase
    .from("quotes")
    .select("topic")
    .not("topic", "is", null);

  // Count occurrences
  const topicCounts = new Map<string, number>();
  (data as TopicRow[])?.forEach((q) => {
    if (q.topic) {
      topicCounts.set(q.topic, (topicCounts.get(q.topic) || 0) + 1);
    }
  });

  // Sort by count and return top topics
  return [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([topic]) => topic);
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [{ quotes, total, page, totalPages }, topics] = await Promise.all([
    getQuotes(params),
    getTopics(),
  ]);

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Notable Quotes</h1>
        <p className="text-muted">
          {total} memorable quotes from Lenny&apos;s Podcast guests
        </p>
      </div>

      {/* Topic filters */}
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <Link href="/quotes">
            <Badge
              variant={!params.topic ? "default" : "outline"}
              className="cursor-pointer"
            >
              All Topics
            </Badge>
          </Link>
          {topics.map((topic) => (
            <Link key={topic} href={`/quotes?topic=${encodeURIComponent(topic)}`}>
              <Badge
                variant={params.topic === topic ? "default" : "outline"}
                className="cursor-pointer"
              >
                {topic}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Quotes */}
      <div className="space-y-4">
        {quotes.map((quote) => {
          const episode = quote.episodes;

          return (
            <Card
              key={quote.id}
              className={quote.is_featured ? "border-foreground/20" : ""}
            >
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <Quote className="h-6 w-6 text-muted flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <blockquote className="text-lg mb-3">
                      &ldquo;{quote.content}&rdquo;
                    </blockquote>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {episode && (
                        <>
                          <span className="font-medium">
                            {episode.guest_name}
                          </span>
                          <Link
                            href={`/podcasts/${episode.slug}`}
                            className="text-muted hover:text-foreground flex items-center gap-1"
                          >
                            {episode.title}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </>
                      )}
                      {quote.topic && (
                        <Badge variant="secondary">{quote.topic}</Badge>
                      )}
                      {quote.timestamp && (
                        <span className="text-muted text-xs">
                          at {quote.timestamp}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {quotes.length === 0 && (
        <div className="text-center py-12">
          <Quote className="h-12 w-12 mx-auto text-muted mb-4" />
          <p className="text-muted">
            No quotes found
            {params.topic ? ` for topic "${params.topic}"` : ""}.
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={{
                pathname: "/quotes",
                query: { ...params, page: page - 1 },
              }}
              className="px-4 py-2 border border-border rounded-md hover:bg-card"
            >
              Previous
            </Link>
          )}
          <span className="px-4 py-2 text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={{
                pathname: "/quotes",
                query: { ...params, page: page + 1 },
              }}
              className="px-4 py-2 border border-border rounded-md hover:bg-card"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
