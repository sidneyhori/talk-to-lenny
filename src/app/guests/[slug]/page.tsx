export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDuration } from "@/lib/utils";
import { Mic, Calendar, Clock, Quote } from "lucide-react";

interface Guest {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  companies: string[];
  roles: string[];
  appearance_count: number;
}

interface Episode {
  id: string;
  title: string;
  slug: string;
  publish_date: string;
  duration_seconds: number;
  summary: string | null;
}

interface QuoteWithEpisode {
  content: string;
  topic: string | null;
  episodes: { title: string; slug: string } | null;
}

async function getGuest(slug: string): Promise<Guest | null> {
  const { data } = await supabase
    .from("guests")
    .select("*")
    .eq("slug", slug)
    .single();

  return data as Guest | null;
}

async function getGuestEpisodes(guestName: string): Promise<Episode[]> {
  const { data } = await supabase
    .from("episodes")
    .select("id, title, slug, publish_date, duration_seconds, summary")
    .eq("guest_name", guestName)
    .order("publish_date", { ascending: false });

  return (data as Episode[]) || [];
}

async function getGuestQuotes(guestId: string): Promise<QuoteWithEpisode[]> {
  const { data } = await supabase
    .from("quotes")
    .select("content, topic, episodes(title, slug)")
    .eq("guest_id", guestId)
    .limit(5);

  return (data as QuoteWithEpisode[]) || [];
}

export default async function GuestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guest = await getGuest(slug);

  if (!guest) {
    notFound();
  }

  const [episodes, quotes] = await Promise.all([
    getGuestEpisodes(guest.name),
    getGuestQuotes(guest.id),
  ]);

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/guests"
          className="text-sm text-muted hover:text-foreground mb-4 inline-block"
        >
          &larr; Back to Guests
        </Link>
        <h1 className="text-3xl font-bold mb-3">{guest.name}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted mb-4">
          <span className="flex items-center gap-1">
            <Mic className="h-4 w-4" />
            {guest.appearance_count} episode{guest.appearance_count !== 1 ? "s" : ""}
          </span>
        </div>
        {guest.bio && <p className="text-muted max-w-2xl">{guest.bio}</p>}
        {guest.companies && guest.companies.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {guest.companies.map((company) => (
              <Badge key={company} variant="outline">
                {company}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Episodes */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Episodes</h2>
          <div className="space-y-4">
            {episodes.map((episode) => (
              <Link key={episode.id} href={`/podcasts/${episode.slug}`}>
                <Card className="hover:border-foreground/20 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{episode.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted mb-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDate(episode.publish_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatDuration(episode.duration_seconds)}
                      </span>
                    </div>
                    {episode.summary && (
                      <p className="text-sm text-muted line-clamp-2">
                        {episode.summary}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Sidebar - Quotes */}
        <div>
          {quotes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Quote className="h-4 w-4" />
                  Notable Quotes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {quotes.map((quote, i) => (
                    <div key={i} className="text-sm">
                      <p className="italic mb-1">&ldquo;{quote.content}&rdquo;</p>
                      {quote.topic && (
                        <Badge variant="secondary" className="text-xs">
                          {quote.topic}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
