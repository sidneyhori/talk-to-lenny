import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fail fast if required env vars are missing in production
if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  console.warn("Supabase env vars not set - database features will not work");
}

export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key"
);

// Server-side client with service role key for admin operations
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fail fast if required env vars are missing
  if (!url || !serviceRoleKey) {
    throw new Error("Missing required Supabase server environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(url, serviceRoleKey);
}
