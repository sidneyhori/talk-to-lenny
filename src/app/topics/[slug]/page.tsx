export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDuration } from "@/lib/utils";
import { Tag, Calendar, Clock } from "lucide-react";

interface Topic {
  id: string;
  name: string;
  slug: string;
  episode_count: number;
}

interface Episode {
  id: string;
  title: string;
  slug: string;
  guest_name: string;
  publish_date: string;
  duration_seconds: number;
  summary: string | null;
}

interface EpisodeTopic {
  episode_id: string;
}

interface TopicLink {
  topic_id: string;
}

interface RelatedTopic {
  id: string;
  name: string;
  slug: string;
}

async function getTopic(slug: string): Promise<Topic | null> {
  const { data } = await supabase
    .from("topics")
    .select("*")
    .eq("slug", slug)
    .single();

  return data as Topic | null;
}

async function getTopicEpisodes(topicId: string): Promise<Episode[]> {
  const { data: episodeTopics } = await supabase
    .from("episode_topics")
    .select("episode_id")
    .eq("topic_id", topicId);

  if (!episodeTopics || episodeTopics.length === 0) return [];

  const episodeIds = (episodeTopics as EpisodeTopic[]).map((et) => et.episode_id);

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, title, slug, guest_name, publish_date, duration_seconds, summary")
    .in("id", episodeIds)
    .order("publish_date", { ascending: false });

  return (episodes as Episode[]) || [];
}

async function getRelatedTopics(topicId: string): Promise<RelatedTopic[]> {
  // Get topics that appear in the same episodes
  const { data: episodeTopics } = await supabase
    .from("episode_topics")
    .select("episode_id")
    .eq("topic_id", topicId);

  if (!episodeTopics || episodeTopics.length === 0) return [];

  const episodeIds = (episodeTopics as EpisodeTopic[]).map((et) => et.episode_id);

  const { data: relatedTopicLinks } = await supabase
    .from("episode_topics")
    .select("topic_id")
    .in("episode_id", episodeIds)
    .neq("topic_id", topicId);

  if (!relatedTopicLinks) return [];

  // Count occurrences and get top related topics
  const topicCounts = new Map<string, number>();
  (relatedTopicLinks as TopicLink[]).forEach((link) => {
    topicCounts.set(link.topic_id, (topicCounts.get(link.topic_id) || 0) + 1);
  });

  const topTopicIds = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const { data: topics } = await supabase
    .from("topics")
    .select("id, name, slug")
    .in("id", topTopicIds);

  return (topics as RelatedTopic[]) || [];
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = await getTopic(slug);

  if (!topic) {
    notFound();
  }

  const [episodes, relatedTopics] = await Promise.all([
    getTopicEpisodes(topic.id),
    getRelatedTopics(topic.id),
  ]);

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Tag className="h-8 w-8" />
          <h1 className="text-3xl font-bold">{topic.name}</h1>
        </div>
        <p className="text-muted">
          {topic.episode_count} episode{topic.episode_count !== 1 ? "s" : ""}{" "}
          discuss this topic
        </p>
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
                    <p className="text-sm font-medium mb-2">
                      {episode.guest_name}
                    </p>
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

          {episodes.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted">No episodes found for this topic.</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {relatedTopics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related Topics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {relatedTopics.map((t) => (
                    <Link key={t.id} href={`/topics/${t.slug}`}>
                      <Badge variant="outline" className="cursor-pointer">
                        {t.name}
                      </Badge>
                    </Link>
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
