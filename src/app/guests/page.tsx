export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users, Mic, Quote } from "lucide-react";

// Clean summary text by removing guest name prefixes for card display
function cleanSummary(text: string, guestName: string): string {
  let cleaned = text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/\n+/g, " ") // newlines to spaces
    .trim();

  // Remove "Guest:" or "Guests:" prefix
  cleaned = cleaned.replace(/^Guests?:\s*/i, "");

  // Get all individual names (handle "Name1 and Name2" format)
  const names = guestName
    .split(/\s+and\s+|\s*&\s*|\s*,\s*/i)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  // Also add base names without version suffixes (e.g., "Bob Moesta" from "Bob Moesta 2.0")
  const allNames = [...names];
  for (const name of names) {
    const baseName = name.replace(/\s+\d+(\.\d+)?$/, "").trim(); // Remove "2.0", "2", etc.
    if (baseName !== name && baseName.length > 0) {
      allNames.push(baseName);
    }
  }

  // Helper function to remove "Name - Description." pattern
  function removeNamePattern(text: string, name: string): string {
    const nameWithDash = name + " - ";
    const lowerText = text.toLowerCase();
    const lowerPattern = nameWithDash.toLowerCase();
    
    if (lowerText.startsWith(lowerPattern)) {
      const afterName = text.slice(nameWithDash.length);
      const periodIndex = afterName.indexOf(".");
      if (periodIndex !== -1) {
        return afterName.slice(periodIndex + 1).trim();
      }
    }
    return text;
  }

  // Try to remove "Name - Description." patterns for all name variants
  for (const name of allNames) {
    const before = cleaned;
    cleaned = removeNamePattern(cleaned, name);
    if (cleaned !== before) {
      // Successfully removed, continue to check for more (multi-guest case)
      continue;
    }
  }

  // Handle "Name is/was..." pattern at the start
  for (const name of allNames) {
    const patterns = [
      name + " is ",
      name + " was ",
      name + ", ",
    ];
    for (const pattern of patterns) {
      if (cleaned.toLowerCase().startsWith(pattern.toLowerCase())) {
        cleaned = cleaned.slice(pattern.length);
        break;
      }
    }
  }

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

interface Guest {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  companies: string[];
  roles: string[];
  appearance_count: number;
}

interface GuestQuote {
  guest_id: string;
  content: string;
}

interface EpisodeInfo {
  guest_name: string;
  title: string;
  summary: string | null;
}

interface GuestWithExtras extends Guest {
  quote: string | null;
  latestEpisodeTitle: string | null;
  episodeSummary: string | null;
}

async function getGuests(search?: string): Promise<GuestWithExtras[]> {
  let query = supabase
    .from("guests")
    .select("*")
    .order("appearance_count", { ascending: false });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data: guests } = await query;
  if (!guests || guests.length === 0) return [];

  // Get guest names for episode lookup
  const guestNames = guests.map((g: Guest) => g.name);
  
  // Get one quote per guest (for guests that have quotes)
  const guestIds = guests.map((g: Guest) => g.id);
  const { data: quotes } = await supabase
    .from("quotes")
    .select("guest_id, content")
    .in("guest_id", guestIds)
    .not("guest_id", "is", null);

  // Get latest episode info for each guest
  const { data: episodes } = await supabase
    .from("episodes")
    .select("guest_name, title, summary")
    .in("guest_name", guestNames)
    .order("publish_date", { ascending: false });

  // Create a map of guest_id to their best quote (shortest good one for card display)
  const quoteMap = new Map<string, string>();
  if (quotes) {
    for (const quote of quotes as GuestQuote[]) {
      if (!quote.guest_id) continue;
      const existing = quoteMap.get(quote.guest_id);
      // Prefer quotes between 50-200 chars for card display
      if (!existing && quote.content.length >= 30 && quote.content.length <= 200) {
        quoteMap.set(quote.guest_id, quote.content);
      }
    }
  }

  // Create a map of guest_name to their latest episode info
  const episodeMap = new Map<string, { title: string; summary: string | null }>();
  if (episodes) {
    for (const ep of episodes as EpisodeInfo[]) {
      if (!episodeMap.has(ep.guest_name)) {
        episodeMap.set(ep.guest_name, { title: ep.title, summary: ep.summary });
      }
    }
  }

  return (guests as Guest[]).map((guest) => ({
    ...guest,
    quote: quoteMap.get(guest.id) || null,
    latestEpisodeTitle: episodeMap.get(guest.name)?.title || null,
    episodeSummary: episodeMap.get(guest.name)?.summary || null,
  }));
}

async function getStats() {
  const { count } = await supabase
    .from("guests")
    .select("*", { count: "exact", head: true });

  return { totalGuests: count || 0 };
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [guests, stats] = await Promise.all([getGuests(q), getStats()]);

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Guests</h1>
        <p className="text-muted">
          {stats.totalGuests} guests have appeared on Lenny&apos;s Podcast
        </p>
      </div>

      {/* Search */}
      <form className="mb-8">
        <Input
          type="search"
          name="q"
          placeholder="Search guests..."
          defaultValue={q}
          className="max-w-md"
        />
      </form>

      {/* Guests grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {guests.map((guest) => (
          <Link key={guest.id} href={`/guests/${guest.slug}`}>
            <Card className="h-full hover:border-foreground/20 transition-colors">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {guest.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted mb-3">
                  <Mic className="h-4 w-4" />
                  {guest.appearance_count} episode
                  {guest.appearance_count !== 1 ? "s" : ""}
                </div>
                {/* Show episode summary as background info */}
                {guest.episodeSummary && (
                  <p className="text-sm text-muted mb-3 line-clamp-2">
                    {cleanSummary(guest.episodeSummary, guest.name)}
                  </p>
                )}
                {guest.quote && (
                  <div className="bg-accent-muted/50 rounded-lg p-3 mt-auto">
                    <div className="flex gap-2">
                      <Quote className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                      <p className="text-sm italic line-clamp-3">
                        &ldquo;{guest.quote}&rdquo;
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {guests.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted">No guests found{q ? ` matching "${q}"` : ""}.</p>
        </div>
      )}
    </div>
  );
}
