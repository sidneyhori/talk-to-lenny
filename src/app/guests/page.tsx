export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Mic } from "lucide-react";

interface Guest {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  companies: string[];
  roles: string[];
  appearance_count: number;
}

async function getGuests(search?: string): Promise<Guest[]> {
  let query = supabase
    .from("guests")
    .select("*")
    .order("appearance_count", { ascending: false });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data } = await query;
  return (data as Guest[]) || [];
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
                {guest.companies && guest.companies.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {guest.companies.slice(0, 3).map((company) => (
                      <Badge key={company} variant="secondary" className="text-xs">
                        {company}
                      </Badge>
                    ))}
                    {guest.companies.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{guest.companies.length - 3} more
                      </Badge>
                    )}
                  </div>
                )}
                {guest.roles && guest.roles.length > 0 && (
                  <p className="text-sm text-muted mt-2">
                    {guest.roles.slice(0, 2).join(", ")}
                  </p>
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
