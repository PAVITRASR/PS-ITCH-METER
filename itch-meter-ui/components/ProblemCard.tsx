"use client";

import { useState } from "react";
import ItchMeter from "./ItchMeter";
import type { ProblemStatement, RawPost } from "@/lib/supabaseClient";

const scopeLabels: Record<string, string> = {
  weekend: "Weekend build",
  semester: "Semester-length",
  "funded-team": "Needs a funded team",
  unknown: "Scope unclear",
};

export default function ProblemCard({
  item,
  postsById,
}: {
  item: ProblemStatement;
  postsById: Record<string, RawPost>;
}) {
  const [open, setOpen] = useState(false);
  const sources = (item.source_post_ids ?? [])
    .map((id) => postsById[id])
    .filter(Boolean);

  return (
    <div
      className="border-b py-6 first:pt-0"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: "var(--paper-raised)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
            >
              {item.domain}
            </span>
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {scopeLabels[item.scope_estimate ?? "unknown"]}
            </span>
          </div>

          <h3 className="font-display text-xl md:text-2xl leading-snug mb-2">
            {item.title}
          </h3>

          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            {item.summary}
          </p>

          <button
            onClick={() => setOpen(!open)}
            className="mt-3 text-sm underline underline-offset-4 decoration-1"
            style={{ color: "var(--ink)" }}
          >
            {open ? "Hide evidence" : `Show evidence (${sources.length} source${sources.length === 1 ? "" : "s"})`}
          </button>

          {open && (
            <div
              className="mt-4 pl-4 border-l-2 space-y-4 text-sm"
              style={{ borderColor: "var(--line)" }}
            >
              <div>
                <span className="font-medium">Gap: </span>
                <span style={{ color: "var(--ink-soft)" }}>{item.gap || "unknown"}</span>
              </div>
              <div>
                <span className="font-medium">Existing solutions: </span>
                <span style={{ color: "var(--ink-soft)" }}>{item.existing_solutions || "unknown"}</span>
              </div>
              <div>
                <span className="font-medium">Affected users: </span>
                <span style={{ color: "var(--ink-soft)" }}>{item.affected_users || "unknown"}</span>
              </div>
              <div>
                <span className="font-medium">Confidence: </span>
                <span style={{ color: "var(--ink-soft)" }}>{item.confidence || "low"}</span>
              </div>

              <div>
                <span className="font-medium block mb-2">Sources:</span>
                {sources.length === 0 && (
                  <span style={{ color: "var(--ink-soft)" }}>No source links available.</span>
                )}
                <ul className="space-y-2">
                  {sources.map((post) => (
                    <li key={post.id}>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 decoration-1 break-words"
                        style={{ color: "var(--ink)" }}
                      >
                        {post.title}
                      </a>
                      <span className="block text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                        {post.source} · {post.points} points · {post.num_comments} comments
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="w-full md:w-40 shrink-0">
          <ItchMeter score={item.itch_score ?? 0} />
        </div>
      </div>
    </div>
  );
}
