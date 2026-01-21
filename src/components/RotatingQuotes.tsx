"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Quote {
  content: string;
  topic: string | null;
  guest_name: string | null;
}

interface RotatingQuotesProps {
  quotes: Quote[];
}

export function RotatingQuotes({ quotes }: RotatingQuotesProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto-rotate every 8 seconds
  useEffect(() => {
    if (quotes.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % quotes.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [quotes.length]);

  if (quotes.length === 0) return null;

  const currentQuote = quotes[currentIndex];

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + quotes.length) % quotes.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % quotes.length);
  };

  return (
    <Card className="bg-accent-muted border-none">
      <CardContent className="py-8 px-6 md:px-12 relative min-h-[200px] flex flex-col justify-center">
        {quotes.length > 1 && (
          <>
            <button
              onClick={goToPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/50 transition-colors"
              aria-label="Previous quote"
            >
              <ChevronLeft className="h-5 w-5 text-foreground/60" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/50 transition-colors"
              aria-label="Next quote"
            >
              <ChevronRight className="h-5 w-5 text-foreground/60" />
            </button>
          </>
        )}

        <div className="max-w-3xl mx-auto text-center flex-1 flex flex-col justify-center">
          <blockquote className="text-lg md:text-xl italic mb-4 text-foreground">
            &ldquo;{currentQuote.content}&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-2 text-foreground">
            <span className="text-muted">&mdash;</span>
            <p className="font-medium uppercase tracking-wide text-accent">{currentQuote.guest_name}</p>
          </div>
        </div>

        {/* Dots indicator */}
        {quotes.length > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {quotes.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentIndex ? "bg-accent" : "bg-foreground/20"
                }`}
                aria-label={`Go to quote ${i + 1}`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
