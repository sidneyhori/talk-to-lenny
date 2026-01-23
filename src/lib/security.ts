import { z } from "zod";

/**
 * Escape special characters for use in ILIKE queries to prevent SQL injection
 * Escapes: % _ \ and other special PostgreSQL pattern characters
 */
export function escapeILikePattern(input: string): string {
  return input
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/%/g, "\\%") // Escape percent signs
    .replace(/_/g, "\\_") // Escape underscores
    .replace(/'/g, "''"); // Escape single quotes
}

/**
 * Escape special characters for use in RegExp to prevent ReDoS attacks
 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validate and truncate message input
 */
export function sanitizeMessage(message: string, maxLength: number = 5000): string {
  if (typeof message !== "string") {
    throw new Error("Invalid message format");
  }
  return message.trim().slice(0, maxLength);
}

// Zod schema for chat API request
export const ChatRequestSchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message too long"),
  episodeId: z
    .string()
    .uuid("Invalid episode ID format")
    .optional()
    .nullable(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10000),
      })
    )
    .max(20, "Too many history items")
    .default([]),
});

export type ValidatedChatRequest = z.infer<typeof ChatRequestSchema>;

// Zod schema for search API request
export const SearchRequestSchema = z.object({
  query: z
    .string()
    .min(1, "Query is required")
    .max(500, "Query too long"),
  type: z.enum(["semantic", "text", "hybrid"]).default("hybrid"),
  limit: z.number().int().min(1).max(50).default(10),
});

export type ValidatedSearchRequest = z.infer<typeof SearchRequestSchema>;

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 20,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  // Clean up old entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, value] of rateLimitStore) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!record || record.resetTime < now) {
    // New window
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: record.resetTime - now,
    };
  }

  record.count++;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetIn: record.resetTime - now,
  };
}

/**
 * Get client IP from request headers (works with Vercel, Cloudflare, etc.)
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}
