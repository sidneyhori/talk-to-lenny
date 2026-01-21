export const dynamic = "force-dynamic";

import Link from "next/link";
import { MessageSquare, Mic, Users, BookOpen, Quote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotatingQuotes } from "@/components/RotatingQuotes";
import { supabase } from "@/lib/supabase";

interface FeaturedQuote {
  content: string;
  topic: string | null;
  guest_name: string | null;
}

interface RecentEpisode {
  id: string;
  title: string;
  guest_name: string;
  slug: string;
  publish_date: string;
  duration_seconds: number;
}

async function getStats() {
  const [
    { count: episodeCount },
    { count: guestCount },
    { count: bookCount },
    { count: quoteCount },
  ] = await Promise.all([
    supabase.from("episodes").select("*", { count: "exact", head: true }),
    supabase.from("guests").select("*", { count: "exact", head: true }),
    supabase.from("books").select("*", { count: "exact", head: true }),
    supabase.from("quotes").select("*", { count: "exact", head: true }),
  ]);

  return {
    episodes: episodeCount || 0,
    guests: guestCount || 0,
    books: bookCount || 0,
    quotes: quoteCount || 0,
  };
}

async function getFeaturedQuotes(): Promise<FeaturedQuote[]> {
  // Get a batch of quotes
  const { data } = await supabase
    .from("quotes")
    .select(
      `
      content,
      topic,
      episodes(guest_name)
    `
    )
    .limit(200);

  if (!data || data.length === 0) return [];

  // Type the data properly
  type QuoteRow = {
    content: string;
    topic: string | null;
    episodes: { guest_name: string } | null;
  };

  // Filter for quotes between 50-300 chars and shuffle
  const goodQuotes = (data as QuoteRow[])
    .filter((q) => q.content.length >= 50 && q.content.length <= 300)
    .map((q) => ({
      content: q.content,
      topic: q.topic,
      guest_name: q.episodes?.guest_name || null,
    }))
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  return goodQuotes;
}

async function getRecentEpisodes(): Promise<RecentEpisode[]> {
  const { data } = await supabase
    .from("episodes")
    .select("id, title, guest_name, slug, publish_date, duration_seconds")
    .order("publish_date", { ascending: false })
    .limit(6);

  return (data as RecentEpisode[]) || [];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function HomePage() {
  const [stats, featuredQuotes, recentEpisodes] = await Promise.all([
    getStats(),
    getFeaturedQuotes(),
    getRecentEpisodes(),
  ]);

  const statItems = [
    { label: "Podcasts", value: stats.episodes, icon: Mic, href: "/podcasts" },
    { label: "Guests", value: stats.guests, icon: Users, href: "/guests" },
    { label: "Books", value: stats.books, icon: BookOpen, href: "/books" },
    { label: "Quotes", value: stats.quotes, icon: Quote, href: "/quotes" },
  ];

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      {/* Hero Section */}
      <section className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Talk to Lenny</h1>
        <p className="text-lg text-muted max-w-2xl mx-auto mb-8">
          Explore insights from {stats.episodes} episodes of Lenny&apos;s Podcast.
          Search transcripts, chat with AI, and discover wisdom from world-class
          product leaders.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/chat">
              <MessageSquare className="mr-2 h-5 w-5" />
              Start Chatting
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/podcasts">Browse Episodes</Link>
          </Button>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
        {statItems.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="hover:border-foreground/20 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-card rounded-md">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-sm text-muted">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      {/* Featured Quotes */}
      {featuredQuotes.length > 0 && (
        <section className="mb-16">
          <RotatingQuotes quotes={featuredQuotes} />
        </section>
      )}

      {/* Recent Episodes */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Recent Episodes</h2>
          <Button asChild variant="ghost">
            <Link href="/podcasts">View all</Link>
          </Button>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentEpisodes.map((episode) => (
            <Link key={episode.id} href={`/podcasts/${episode.slug}`}>
              <Card className="h-full hover:border-foreground/20 transition-colors">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base line-clamp-2">
                    {episode.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium mb-2">{episode.guest_name}</p>
                  <div className="flex items-center gap-3 text-sm text-muted">
                    <span>{formatDate(episode.publish_date)}</span>
                    <span>{formatDuration(episode.duration_seconds)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
