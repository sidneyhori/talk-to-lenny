export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration, formatDate, slugify } from "@/lib/utils";
import { ExternalLink, Calendar, Clock, Eye, BookOpen, Lightbulb, Heart, HelpCircle } from "lucide-react";
import { TranscriptViewer } from "./TranscriptViewer";
import { PodcastChat } from "./PodcastChat";
import ReactMarkdown from "react-markdown";

interface Episode {
  id: string;
  title: string;
  guest_name: string;
  slug: string;
  youtube_url: string;
  publish_date: string;
  duration_seconds: number;
  view_count: number;
  keywords: string[];
  raw_transcript: string;
  summary: string | null;
}

interface LightningRound {
  id: string;
  episode_id: string;
  books_recommended: { title: string; author?: string }[] | null;
  favorite_product: { name: string; description?: string } | null;
  life_motto: string | null;
  interview_question: string | null;
}

interface RelatedEpisode {
  id: string;
  title: string;
  slug: string;
  publish_date: string;
}

async function getEpisode(slug: string): Promise<Episode | null> {
  const { data, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data as Episode;
}

async function getLightningRound(episodeId: string): Promise<LightningRound | null> {
  const { data } = await supabase
    .from("lightning_rounds")
    .select("*")
    .eq("episode_id", episodeId)
    .single();

  return data as LightningRound | null;
}

async function getRelatedEpisodes(guestName: string, currentId: string): Promise<RelatedEpisode[]> {
  const { data } = await supabase
    .from("episodes")
    .select("id, title, slug, publish_date")
    .eq("guest_name", guestName)
    .neq("id", currentId)
    .order("publish_date", { ascending: false })
    .limit(3);

  return (data as RelatedEpisode[]) || [];
}

export default async function PodcastPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const episode = await getEpisode(slug);

  if (!episode) {
    notFound();
  }

  const [lightningRound, relatedEpisodes] = await Promise.all([
    getLightningRound(episode.id),
    getRelatedEpisodes(episode.guest_name, episode.id),
  ]);

  const hasLightningRound = lightningRound && (
    lightningRound.books_recommended?.length ||
    lightningRound.favorite_product ||
    lightningRound.life_motto ||
    lightningRound.interview_question
  );

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/podcasts"
          className="text-sm text-muted hover:text-foreground mb-4 inline-block"
        >
          &larr; Back to Podcasts
        </Link>
        <h1 className="text-3xl font-bold mb-3">{episode.title}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted mb-4">
          <Link
            href={`/guests/${slugify(episode.guest_name)}`}
            className="font-medium text-foreground hover:underline"
          >
            {episode.guest_name}
          </Link>
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {formatDate(episode.publish_date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatDuration(episode.duration_seconds)}
          </span>
          {episode.view_count > 0 && (
            <span className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {episode.view_count.toLocaleString()} views
            </span>
          )}
        </div>
        {episode.keywords && episode.keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {episode.keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary">
                {keyword}
              </Badge>
            ))}
          </div>
        )}
        <Button asChild>
          <a
            href={episode.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Watch on YouTube
          </a>
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Lightning Round - Prominently at top */}
          {hasLightningRound && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  Lightning Round
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {lightningRound.books_recommended && lightningRound.books_recommended.length > 0 && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <BookOpen className="h-4 w-4" />
                      Recommended Books
                    </h4>
                    <ul className="space-y-1">
                      {lightningRound.books_recommended.map((book, i) => (
                        <li key={i} className="text-sm">
                          <span className="font-medium">{book.title}</span>
                          {book.author && (
                            <span className="text-muted"> by {book.author}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {lightningRound.favorite_product && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <Heart className="h-4 w-4" />
                      Favorite Product
                    </h4>
                    <p className="text-sm">
                      <span className="font-medium">
                        {lightningRound.favorite_product.name}
                      </span>
                      {lightningRound.favorite_product.description && (
                        <span className="text-muted">
                          {" - "}
                          {lightningRound.favorite_product.description}
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {lightningRound.life_motto && (
                  <div>
                    <h4 className="font-medium mb-2">Life Motto</h4>
                    <p className="text-sm italic">&ldquo;{lightningRound.life_motto}&rdquo;</p>
                  </div>
                )}
                {lightningRound.interview_question && (
                  <div>
                    <h4 className="font-medium flex items-center gap-2 mb-2">
                      <HelpCircle className="h-4 w-4" />
                      Favorite Interview Question
                    </h4>
                    <p className="text-sm">{lightningRound.interview_question}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          {episode.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-foreground">
                  <ReactMarkdown>{episode.summary}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transcript */}
          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <TranscriptViewer transcript={episode.raw_transcript} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Episode Chat */}
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-base">Chat about this episode</CardTitle>
            </CardHeader>
            <CardContent>
              <PodcastChat
                episodeId={episode.id}
                episodeTitle={episode.title}
              />
            </CardContent>
          </Card>

          {/* Related Episodes */}
          {relatedEpisodes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  More from {episode.guest_name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {relatedEpisodes.map((ep) => (
                    <li key={ep.id}>
                      <Link
                        href={`/podcasts/${ep.slug}`}
                        className="text-sm hover:underline line-clamp-2"
                      >
                        {ep.title}
                      </Link>
                      <p className="text-xs text-muted">
                        {formatDate(ep.publish_date)}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
