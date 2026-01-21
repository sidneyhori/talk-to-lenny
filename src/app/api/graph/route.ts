import { createServerClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

interface GraphNode {
  id: string;
  name: string;
  type: "guest" | "company" | "topic";
  val: number;
  color: string;
}

interface GraphLink {
  source: string;
  target: string;
  value: number;
}

const NODE_COLORS = {
  guest: "#000000",
  company: "#666666",
  topic: "#999999",
};

interface GuestRow { id: string; name: string; appearance_count: number }
interface CompanyRow { id: string; name: string; mention_count: number }
interface TopicRow { id: string; name: string; episode_count: number }
interface GuestCompanyRow { guest_id: string; company_id: string }
interface EpisodeTopicRow { episode_id: string; topic_id: string }
interface EpisodeRow { id: string; guest_name: string; keywords: string[] }

export async function GET() {
  try {
    const supabase = createServerClient();

    // Fetch data in parallel
    const [
      { data: guests },
      { data: companies },
      { data: topics },
      { data: guestCompanies },
      { data: episodeTopics },
      { data: episodes },
    ] = await Promise.all([
      supabase.from("guests").select("id, name, appearance_count").limit(100) as unknown as { data: GuestRow[] | null },
      supabase.from("companies").select("id, name, mention_count").limit(50) as unknown as { data: CompanyRow[] | null },
      supabase.from("topics").select("id, name, episode_count").limit(30) as unknown as { data: TopicRow[] | null },
      supabase.from("guest_companies").select("guest_id, company_id") as unknown as { data: GuestCompanyRow[] | null },
      supabase.from("episode_topics").select("episode_id, topic_id") as unknown as { data: EpisodeTopicRow[] | null },
      supabase.from("episodes").select("id, guest_name, keywords") as unknown as { data: EpisodeRow[] | null },
    ]);

    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // Add guest nodes
    guests?.forEach((guest) => {
      nodes.push({
        id: `guest-${guest.id}`,
        name: guest.name,
        type: "guest",
        val: Math.max(5, Math.min(20, guest.appearance_count * 3)),
        color: NODE_COLORS.guest,
      });
    });

    // Add company nodes
    companies?.forEach((company) => {
      nodes.push({
        id: `company-${company.id}`,
        name: company.name,
        type: "company",
        val: Math.max(4, Math.min(15, company.mention_count * 2)),
        color: NODE_COLORS.company,
      });
    });

    // Add topic nodes
    topics?.forEach((topic) => {
      nodes.push({
        id: `topic-${topic.id}`,
        name: topic.name,
        type: "topic",
        val: Math.max(3, Math.min(12, topic.episode_count)),
        color: NODE_COLORS.topic,
      });
    });

    // Create guest-company links
    guestCompanies?.forEach((gc) => {
      links.push({
        source: `guest-${gc.guest_id}`,
        target: `company-${gc.company_id}`,
        value: 1,
      });
    });

    // Create episode-topic links (mapped through guest)
    const guestNameToId = new Map(
      guests?.map((g) => [g.name, g.id]) || []
    );

    episodeTopics?.forEach((et) => {
      const episode = episodes?.find((e) => e.id === et.episode_id);
      if (episode) {
        const guestId = guestNameToId.get(episode.guest_name);
        if (guestId) {
          links.push({
            source: `guest-${guestId}`,
            target: `topic-${et.topic_id}`,
            value: 1,
          });
        }
      }
    });

    // Create guest-guest links based on shared topics
    // This creates connections between guests who discuss similar topics
    const guestTopics = new Map<string, Set<string>>();
    episodeTopics?.forEach((et) => {
      const episode = episodes?.find((e) => e.id === et.episode_id);
      if (episode) {
        const guestId = guestNameToId.get(episode.guest_name);
        if (guestId) {
          const topicsSet = guestTopics.get(guestId) || new Set();
          topicsSet.add(et.topic_id);
          guestTopics.set(guestId, topicsSet);
        }
      }
    });

    // Connect guests with overlapping topics
    const guestIds = [...guestTopics.keys()];
    for (let i = 0; i < guestIds.length; i++) {
      for (let j = i + 1; j < guestIds.length; j++) {
        const topicsA = guestTopics.get(guestIds[i])!;
        const topicsB = guestTopics.get(guestIds[j])!;
        const overlap = [...topicsA].filter((t) => topicsB.has(t)).length;

        if (overlap >= 2) {
          links.push({
            source: `guest-${guestIds[i]}`,
            target: `guest-${guestIds[j]}`,
            value: overlap,
          });
        }
      }
    }

    // Remove duplicate links
    const uniqueLinks = links.reduce((acc, link) => {
      const key = [link.source, link.target].sort().join("-");
      if (!acc.has(key)) {
        acc.set(key, link);
      }
      return acc;
    }, new Map<string, GraphLink>());

    return NextResponse.json({
      nodes,
      links: [...uniqueLinks.values()],
    });
  } catch (error) {
    console.error("Graph API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
