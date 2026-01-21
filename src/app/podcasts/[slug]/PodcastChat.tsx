"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PodcastChatProps {
  episodeId: string;
  episodeTitle: string;
}

export function PodcastChat({ episodeId }: PodcastChatProps) {
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
          episodeId,
          history: messages,
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantMessage = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);

        // Handle the __SOURCES__ marker - strip it out for episode chat
        if (chunk.includes("__SOURCES__")) {
          const parts = chunk.split("__SOURCES__");
          assistantMessage += parts[0];
        } else if (!assistantMessage.includes("__SOURCES__")) {
          assistantMessage += chunk;
        }

        // Clean any sources from the displayed message
        const displayContent = assistantMessage.split("__SOURCES__")[0];

        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: "assistant",
            content: displayContent,
          };
          return newMessages;
        });
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

  return (
    <div className="flex flex-col h-[400px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="text-sm text-muted text-center py-8">
            <p className="mb-2">Ask questions about this episode</p>
            <p className="text-xs">
              Try: &ldquo;What are the key takeaways?&rdquo; or &ldquo;What did they say about
              hiring?&rdquo;
            </p>
          </div>
        )}
        {messages.map((message, i) => (
          <div
            key={i}
            className={
              message.role === "user"
                ? "bg-accent text-white p-3 rounded-lg ml-4 text-sm"
                : ""
            }
          >
            {message.role === "user" ? (
              message.content
            ) : message.content ? (
              <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-strong:text-foreground">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            ) : (
              <span className="flex items-center gap-2 text-muted text-sm">
                <Loader2 className="h-3 w-3 animate-spin" />
                Thinking...
              </span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this episode..."
          disabled={isLoading}
        />
        <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
