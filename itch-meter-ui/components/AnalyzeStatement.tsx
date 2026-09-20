"use client";

import { useState } from "react";
import ItchMeter from "./ItchMeter";

type Source = {
  title: string;
  url: string;
  points: number;
  num_comments: number;
};

type Analysis = {
  itch_score: number;
  gap_exists: boolean;
  gap_explanation: string;
  existing_solutions: string;
  affected_users: string;
  sources: Source[];
};

type BusinessIdea = { title: string; description: string };

export default function AnalyzeStatement() {
  const [statement, setStatement] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);

  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideas, setIdeas] = useState<BusinessIdea[] | null>(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    setIdeas(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Could not reach the analysis service. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBusinessIdeas() {
    if (!result) return;
    setIdeasLoading(true);
    try {
      const res = await fetch("/api/business-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement,
          gap_explanation: result.gap_explanation,
          existing_solutions: result.existing_solutions,
          affected_users: result.affected_users,
        }),
      });
      const data = await res.json();
      setIdeas(data.ideas ?? []);
    } catch {
      setIdeas([]);
    } finally {
      setIdeasLoading(false);
    }
  }

  return (
    <section
      className="mb-14 pb-10 border-b"
      style={{ borderColor: "var(--line)" }}
    >
      <h2 className="font-display text-2xl mb-2">Test your own problem statement</h2>
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
        Paste an idea below. We check it against real discussions — no invented gaps, no invented competitors.
      </p>

      <textarea
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        placeholder="e.g. Small business owners struggle to reconcile payments across multiple processors..."
        rows={3}
        className="w-full p-3 rounded-lg border text-sm resize-none bg-transparent"
        style={{ borderColor: "var(--line)" }}
      />

      <button
        onClick={handleAnalyze}
        disabled={loading || statement.trim().length < 10}
        className="mt-3 px-4 py-2 rounded-full text-sm font-medium disabled:opacity-40"
        style={{ background: "var(--ink)", color: "var(--paper-raised)" }}
      >
        {loading ? "Checking real sources…" : "Analyze"}
      </button>

      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--itch-high)" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="w-full md:w-64">
            <ItchMeter score={result.itch_score} />
          </div>

          <div className="text-sm">
            <span className="font-medium">
              {result.gap_exists ? "Real gap found: " : "Gap likely doesn't exist: "}
            </span>
            <span style={{ color: "var(--ink-soft)" }}>{result.gap_explanation}</span>
          </div>

          <div className="text-sm">
            <span className="font-medium">Existing solutions: </span>
            <span style={{ color: "var(--ink-soft)" }}>{result.existing_solutions}</span>
          </div>

          <div className="text-sm">
            <span className="font-medium">Affected users: </span>
            <span style={{ color: "var(--ink-soft)" }}>{result.affected_users}</span>
          </div>

          <div className="text-sm">
            <span className="font-medium block mb-2">Verified sources:</span>
            {result.sources.length === 0 && (
              <span style={{ color: "var(--ink-soft)" }}>
                No directly relevant discussions found — treat this analysis as low-confidence.
              </span>
            )}
            <ul className="space-y-2">
              {result.sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 decoration-1"
                    style={{ color: "var(--ink)" }}
                  >
                    {s.title}
                  </a>
                  <span className="block text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                    {s.points} points · {s.num_comments} comments
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {!ideas && (
            <button
              onClick={handleBusinessIdeas}
              disabled={ideasLoading}
              className="text-sm underline underline-offset-4 decoration-1"
              style={{ color: "var(--ink)" }}
            >
              {ideasLoading ? "Brainstorming…" : "Suggest business model ideas (speculative)"}
            </button>
          )}

          {ideas && (
            <div className="mt-2">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>
                Speculative brainstorm — not grounded in sources
              </p>
              <div className="space-y-3">
                {ideas.map((idea, i) => (
                  <div key={i}>
                    <p className="font-medium text-sm">{idea.title}</p>
                    <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                      {idea.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
