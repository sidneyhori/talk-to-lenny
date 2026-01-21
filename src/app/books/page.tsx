export const dynamic = "force-dynamic";

import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users } from "lucide-react";

interface Book {
  id: string;
  title: string;
  author: string | null;
  recommendation_count: number;
  recommenders: string[];
}

async function getBooks(): Promise<Book[]> {
  const { data } = await supabase
    .from("books")
    .select("*")
    .order("recommendation_count", { ascending: false });

  return (data as Book[]) || [];
}

async function getStats() {
  const { count } = await supabase
    .from("books")
    .select("*", { count: "exact", head: true });

  const { data: topBook } = await supabase
    .from("books")
    .select("recommendation_count")
    .order("recommendation_count", { ascending: false })
    .limit(1)
    .single() as unknown as { data: { recommendation_count: number } | null };

  return {
    totalBooks: count || 0,
    maxRecommendations: topBook?.recommendation_count || 0,
  };
}

export default async function BooksPage() {
  const [books, stats] = await Promise.all([getBooks(), getStats()]);

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Book Recommendations</h1>
        <p className="text-muted">
          {stats.totalBooks} books recommended by guests on Lenny&apos;s Podcast
        </p>
      </div>

      {/* Books grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {books.map((book) => (
          <Card key={book.id} className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-start gap-2">
                <BookOpen className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <span>{book.title}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {book.author && (
                <p className="text-sm text-muted mb-3">by {book.author}</p>
              )}
              <div className="flex items-center gap-2 mb-3">
                <Badge
                  variant={
                    book.recommendation_count > 1 ? "default" : "secondary"
                  }
                >
                  <Users className="h-3 w-3 mr-1" />
                  {book.recommendation_count} recommendation
                  {book.recommendation_count !== 1 ? "s" : ""}
                </Badge>
              </div>
              {book.recommenders && book.recommenders.length > 0 && (
                <div className="text-sm text-muted">
                  <p className="font-medium text-foreground text-xs mb-1">
                    Recommended by:
                  </p>
                  <p className="text-xs">
                    {book.recommenders.slice(0, 3).join(", ")}
                    {book.recommenders.length > 3 && (
                      <span>
                        {" "}
                        and {book.recommenders.length - 3} more
                      </span>
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {books.length === 0 && (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 mx-auto text-muted mb-4" />
          <p className="text-muted">No books have been recommended yet.</p>
          <p className="text-sm text-muted mt-2">
            Run the extraction script to populate book recommendations.
          </p>
        </div>
      )}
    </div>
  );
}
