"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Send, Loader2, MessageSquare, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import DOMPurify from "isomorphic-dompurify";

// Sanitize content before rendering to prevent XSS
function sanitizeContent(content: string): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ["p", "strong", "em", "ul", "ol", "li", "code", "pre", "br", "a", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}

interface Source {
  episodeId: string;
  episodeTitle: string;
  episodeSlug: string;
  timestamp?: string;
  snippet: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

const EXAMPLE_QUESTIONS = [
  "What does Brian Chesky say about product design?",
  "How do top PMs prioritize their roadmap?",
  "What advice do guests give about founder-market fit?",
  "What books are most recommended on the podcast?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    // Scroll to bottom once when sending message
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages.slice(-10), // Last 10 messages for context
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantMessage = "";
      let sources: Source[] = [];
      let isReadingSources = false;
      let sourcesBuffer = "";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", sources: [] },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);

        // Check for sources marker
        if (chunk.includes("__SOURCES__")) {
          isReadingSources = true;
          const parts = chunk.split("__SOURCES__");
          assistantMessage += parts[0];
          sourcesBuffer = parts[1] || "";
        } else if (isReadingSources) {
          sourcesBuffer += chunk;
        } else {
          assistantMessage += chunk;
        }

        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: "assistant",
            content: assistantMessage,
            sources,
          };
          return newMessages;
        });
      }

      // Parse sources if present
      if (sourcesBuffer) {
        try {
          sources = JSON.parse(sourcesBuffer);
          setMessages((prev) => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              role: "assistant",
              content: assistantMessage,
              sources,
            };
            return newMessages;
          });
        } catch {
          // Ignore parse errors
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (question: string) => {
    setInput(question);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-[3vw] py-8 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Chat with Lenny&apos;s Podcast</h1>
        <p className="text-muted text-sm sm:text-base">
          Ask questions and get answers from 303 episodes of product and growth
          wisdom.
        </p>
      </div>

      {/* Chat container */}
      <div className="border border-border rounded-xl shadow-sm flex flex-col h-[calc(100vh-200px)] sm:h-[calc(100vh-240px)] md:h-[600px]">
        {/* Messages area - scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="text-center py-8 sm:py-16 px-4">
              <MessageSquare className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted mb-4" />
              <h2 className="text-lg sm:text-xl font-medium mb-3 sm:mb-4">Start a conversation</h2>
              <p className="text-muted text-sm sm:text-base mb-6 sm:mb-8 max-w-md mx-auto">
                I can answer questions about product management, growth, leadership,
                and more based on Lenny&apos;s podcast episodes.
              </p>
              <div className="flex flex-col sm:flex-wrap sm:flex-row justify-center gap-2">
                {EXAMPLE_QUESTIONS.map((question) => (
                  <Button
                    key={question}
                    variant="outline"
                    size="sm"
                    onClick={() => handleExampleClick(question)}
                    className="text-sm text-left sm:text-center"
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((message, i) => (
              <div key={i}>
                {message.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="bg-accent text-white p-4 rounded-lg max-w-[80%]">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-strong:text-foreground prose-headings:text-foreground">
                      {message.content ? (
                        <ReactMarkdown>{sanitizeContent(message.content)}</ReactMarkdown>
                      ) : (
                        <div className="flex items-center gap-2 text-muted py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Searching transcripts...</span>
                        </div>
                      )}
                    </div>

                    {/* Sources */}
                    {message.sources && message.sources.length > 0 && (
                      <Card>
                        <CardContent className="pt-4">
                          <h4 className="text-sm font-medium mb-3">Sources</h4>
                          <div className="space-y-3">
                            {message.sources.map((source, j) => (
                              <div key={j} className="text-sm">
                                <Link
                                  href={`/podcasts/${source.episodeSlug}`}
                                  className="font-medium hover:underline flex items-center gap-1"
                                >
                                  {source.episodeTitle}
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                                {source.timestamp && (
                                  <span className="text-muted text-xs">
                                    {" "}
                                    at {source.timestamp}
                                  </span>
                                )}
                                <p className="text-muted text-xs mt-1 line-clamp-2">
                                  {source.snippet}
                                </p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            ))}
            {/* Show thinking indicator immediately after user sends message */}
            {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
              <div className="flex items-center gap-2 text-muted py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Searching transcripts...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input - fixed at bottom */}
        <div className="border-t border-border p-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about product, growth, leadership..."
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
