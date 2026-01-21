export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PodcastFilters } from "./PodcastFilters";
import { formatDuration, formatDate } from "@/lib/utils";

interface SearchParams {
  q?: string;
  guest?: string;
  sort?: string;
  page?: string;
}

interface Episode {
  id: string;
  title: string;
  guest_name: string;
  slug: string;
  publish_date: string;
  duration_seconds: number;
  view_count: number;
  keywords: string[];
  summary: string | null;
}

interface GuestName {
  name: string;
}

async function getEpisodes(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || "1");
  const perPage = 12;
  const offset = (page - 1) * perPage;

  let query = supabase
    .from("episodes")
    .select("id, title, guest_name, slug, publish_date, duration_seconds, view_count, keywords, summary", { count: "exact" });

  // Search filter
  if (searchParams.q) {
    query = query.or(`title.ilike.%${searchParams.q}%,guest_name.ilike.%${searchParams.q}%`);
  }

  // Guest filter
  if (searchParams.guest) {
    query = query.eq("guest_name", searchParams.guest);
  }

  // Sorting
  switch (searchParams.sort) {
    case "oldest":
      query = query.order("publish_date", { ascending: true });
      break;
    case "popular":
      query = query.order("view_count", { ascending: false });
      break;
    default:
      query = query.order("publish_date", { ascending: false });
  }

  // Pagination
  query = query.range(offset, offset + perPage - 1);

  const { data, count } = await query;

  return {
    episodes: (data as Episode[]) || [],
    total: count || 0,
    page,
    perPage,
    totalPages: Math.ceil((count || 0) / perPage),
  };
}

async function getGuests(): Promise<string[]> {
  const { data } = await supabase
    .from("guests")
    .select("name")
    .order("appearance_count", { ascending: false })
    .limit(100);

  return (data as GuestName[])?.map((g) => g.name) || [];
}

function EpisodeCard({ episode }: { episode: {
  id: string;
  title: string;
  guest_name: string;
  slug: string;
  publish_date: string;
  duration_seconds: number;
  view_count: number;
  keywords: string[];
  summary: string | null;
}}) {
  return (
    <Link href={`/podcasts/${episode.slug}`}>
      <Card className="h-full hover:border-foreground/20 transition-colors">
        <CardHeader className="pb-3">
          <CardTitle className="text-base line-clamp-2">{episode.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium mb-2">{episode.guest_name}</p>
          {episode.summary && (
            <p className="text-sm text-muted line-clamp-2 mb-3">{episode.summary}</p>
          )}
          <div className="flex items-center gap-3 text-sm text-muted mb-3">
            <span>{formatDate(episode.publish_date)}</span>
            <span>{formatDuration(episode.duration_seconds)}</span>
          </div>
          {episode.keywords && episode.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {episode.keywords.slice(0, 3).map((keyword) => (
                <Badge key={keyword} variant="secondary" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-1/3 mb-2" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function PodcastsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [{ episodes, total, page, totalPages }, guests] = await Promise.all([
    getEpisodes(params),
    getGuests(),
  ]);

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Podcasts</h1>
        <p className="text-muted">
          Browse {total} episodes from Lenny&apos;s Podcast
        </p>
      </div>

      <PodcastFilters guests={guests} currentParams={params} />

      <Suspense fallback={<LoadingSkeleton />}>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {episodes.map((episode) => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}
        </div>

        {episodes.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted">No episodes found matching your filters.</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {page > 1 && (
              <Link
                href={{
                  pathname: "/podcasts",
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
                  pathname: "/podcasts",
                  query: { ...params, page: page + 1 },
                }}
                className="px-4 py-2 border border-border rounded-md hover:bg-card"
              >
                Next
              </Link>
            )}
          </div>
        )}
      </Suspense>
    </div>
  );
}
