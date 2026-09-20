"use client";

import { useEffect, useState } from "react";
import { supabase, type ProblemStatement, type RawPost } from "@/lib/supabaseClient";
import ProblemCard from "@/components/ProblemCard";
import AnalyzeStatement from "@/components/AnalyzeStatement";

export default function Home() {
  const [items, setItems] = useState<ProblemStatement[]>([]);
  const [postsById, setPostsById] = useState<Record<string, RawPost>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0);

  useEffect(() => {
    async function fetchData() {
      const { data: statements, error: stError } = await supabase
        .from("problem_statements")
        .select("*")
        .order("itch_score", { ascending: false });

      if (stError) {
        setError(stError.message);
        setLoading(false);
        return;
      }

      const { data: posts, error: postError } = await supabase
        .from("raw_posts")
        .select("id, title, url, points, num_comments, source");

      if (postError) {
        setError(postError.message);
        setLoading(false);
        return;
      }

      const map: Record<string, RawPost> = {};
      (posts ?? []).forEach((p) => {
        map[p.id] = p;
      });

      setItems(statements ?? []);
      setPostsById(map);
      setLoading(false);
    }
    fetchData();
  }, []);

  const domains = ["all", ...Array.from(new Set(items.map((i) => i.domain)))];
  const filtered = items.filter(
    (i) =>
      (domainFilter === "all" || i.domain === domainFilter) &&
      (i.itch_score ?? 0) >= minScore
  );

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <h1 className="font-display text-4xl md:text-5xl leading-tight mb-3">
          Problem Statement<br />Itch Meter
        </h1>
        <p className="text-base max-w-lg" style={{ color: "var(--ink-soft)" }}>
          Real problems, pulled from real discussions. Every statement here
          traces back to a source you can check yourself.
        </p>
      </header>

      <AnalyzeStatement />

      <div
        className="flex flex-wrap items-center gap-4 mb-8 pb-6 border-b"
        style={{ borderColor: "var(--line)" }}
      >
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-full border bg-transparent"
          style={{ borderColor: "var(--line)" }}
        >
          {domains.map((d) => (
            <option key={d} value={d}>
              {d === "all" ? "All domains" : d}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
          Min itch score
          <input
            type="range"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-32 accent-current"
          />
          <span className="tabular-nums">{minScore}</span>
        </label>
      </div>

      {loading && (
        <p style={{ color: "var(--ink-soft)" }}>Loading real problem statements…</p>
      )}

      {error && (
        <p style={{ color: "var(--itch-high)" }}>
          Could not load data: {error}
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p style={{ color: "var(--ink-soft)" }}>
          No problem statements match these filters yet.
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div>
          {filtered.map((item) => (
            <ProblemCard key={item.id} item={item} postsById={postsById} />
          ))}
        </div>
      )}
    </main>
  );
}
