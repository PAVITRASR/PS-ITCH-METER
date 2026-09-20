import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type ProblemStatement = {
  id: string;
  domain: string;
  title: string;
  summary: string;
  gap: string | null;
  existing_solutions: string | null;
  affected_users: string | null;
  scope_estimate: string | null;
  itch_score: number | null;
  confidence: string | null;
  source_post_ids: string[] | null;
  created_at: string;
};

export type RawPost = {
  id: string;
  title: string;
  url: string;
  points: number;
  num_comments: number;
  source: string;
};
