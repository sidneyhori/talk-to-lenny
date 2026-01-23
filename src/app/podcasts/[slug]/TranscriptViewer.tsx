"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronDown, ChevronUp } from "lucide-react";

// Escape special regex characters to prevent ReDoS attacks
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface TranscriptViewerProps {
  transcript: string;
}

export function TranscriptViewer({ transcript }: TranscriptViewerProps) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Parse transcript into sections
  const sections = useMemo(() => {
    // Split by timestamps or speaker changes
    const lines = transcript.split("\n");
    const parsed: Array<{
      timestamp?: string;
      speaker?: string;
      text: string;
    }> = [];

    let currentSection: { timestamp?: string; speaker?: string; text: string } = {
      text: "",
    };

    for (const line of lines) {
      // Try to match timestamp pattern [HH:MM:SS] or (HH:MM:SS)
      const timestampMatch = line.match(/[\[\(](\d{1,2}:\d{2}(?::\d{2})?)[\]\)]/);
      // Try to match speaker pattern "Name:"
      const speakerMatch = line.match(/^([A-Za-z\s]+):\s*/);

      if (timestampMatch) {
        // Save current section and start new one
        if (currentSection.text.trim()) {
          parsed.push(currentSection);
        }
        currentSection = {
          timestamp: timestampMatch[1],
          text: line.replace(timestampMatch[0], "").trim(),
        };

        // Check for speaker in same line
        const inlineSpeaker = currentSection.text.match(/^([A-Za-z\s]+):\s*/);
        if (inlineSpeaker) {
          currentSection.speaker = inlineSpeaker[1].trim();
          currentSection.text = currentSection.text
            .replace(inlineSpeaker[0], "")
            .trim();
        }
      } else if (speakerMatch && line.indexOf(":") < 30) {
        // New speaker without timestamp
        if (currentSection.text.trim()) {
          parsed.push(currentSection);
        }
        currentSection = {
          speaker: speakerMatch[1].trim(),
          text: line.replace(speakerMatch[0], "").trim(),
        };
      } else if (line.trim()) {
        // Continue current section
        currentSection.text += " " + line.trim();
      }
    }

    // Don't forget last section
    if (currentSection.text.trim()) {
      parsed.push(currentSection);
    }

    return parsed;
  }, [transcript]);

  // Filter sections by search term
  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;

    const searchLower = search.toLowerCase();
    return sections.filter(
      (section) =>
        section.text.toLowerCase().includes(searchLower) ||
        section.speaker?.toLowerCase().includes(searchLower)
    );
  }, [sections, search]);

  // Show limited sections when not expanded
  const displayedSections = expanded
    ? filteredSections
    : filteredSections.slice(0, 10);

  const highlightSearch = (text: string) => {
    if (!search.trim()) return text;

    // Escape special regex characters to prevent ReDoS
    const escapedSearch = escapeRegExp(search);
    const regex = new RegExp(`(${escapedSearch})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <Input
          type="text"
          placeholder="Search transcript..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {search && (
        <p className="text-sm text-muted">
          {filteredSections.length} result{filteredSections.length !== 1 ? "s" : ""} found
        </p>
      )}

      {/* Transcript content */}
      <div className="space-y-4 text-sm">
        {displayedSections.map((section, i) => (
          <div key={i} className="group">
            <div className="flex gap-3">
              {section.timestamp && (
                <span className="text-muted text-xs font-mono whitespace-nowrap pt-0.5">
                  {section.timestamp}
                </span>
              )}
              <div>
                {section.speaker && (
                  <span className="font-medium">{section.speaker}: </span>
                )}
                <span className="text-foreground/90">
                  {highlightSearch(section.text)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Expand/Collapse */}
      {filteredSections.length > 10 && (
        <Button
          variant="outline"
          onClick={() => setExpanded(!expanded)}
          className="w-full"
        >
          {expanded ? (
            <>
              <ChevronUp className="mr-2 h-4 w-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="mr-2 h-4 w-4" />
              Show all {filteredSections.length} sections
            </>
          )}
        </Button>
      )}

      {filteredSections.length === 0 && search && (
        <p className="text-center text-muted py-8">
          No matches found for &ldquo;{search}&rdquo;
        </p>
      )}
    </div>
  );
}
