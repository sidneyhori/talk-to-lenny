"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

interface PodcastFiltersProps {
  guests: string[];
  currentParams: {
    q?: string;
    guest?: string;
    sort?: string;
  };
}

export function PodcastFilters({ guests, currentParams }: PodcastFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(currentParams.q || "");

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams();

      // Preserve existing params
      if (currentParams.q) params.set("q", currentParams.q);
      if (currentParams.guest) params.set("guest", currentParams.guest);
      if (currentParams.sort) params.set("sort", currentParams.sort);

      // Apply updates
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });

      // Reset to page 1 when filtering
      params.delete("page");

      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [currentParams, pathname, router]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ q: search || undefined });
  };

  const clearFilters = () => {
    setSearch("");
    router.push(pathname);
  };

  const hasFilters = currentParams.q || currentParams.guest || currentParams.sort;

  return (
    <div className="mb-8 space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            type="text"
            placeholder="Search episodes by title or guest..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Guest filter */}
        <select
          value={currentParams.guest || ""}
          onChange={(e) => updateParams({ guest: e.target.value || undefined })}
          className="h-10 px-3 rounded-md border border-border bg-background text-sm"
        >
          <option value="">All Guests</option>
          {guests.map((guest) => (
            <option key={guest} value={guest}>
              {guest}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={currentParams.sort || "newest"}
          onChange={(e) =>
            updateParams({ sort: e.target.value === "newest" ? undefined : e.target.value })
          }
          className="h-10 px-3 rounded-md border border-border bg-background text-sm"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="popular">Most Popular</option>
        </select>

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
