function scoreColor(score: number): string {
  if (score < 34) return "var(--itch-low)";
  if (score < 67) return "var(--itch-mid)";
  return "var(--itch-high)";
}

export default function ItchMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = scoreColor(clamped);

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--line)" }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      <span
        className="font-display text-lg tabular-nums shrink-0"
        style={{ color }}
      >
        {clamped.toFixed(0)}
      </span>
    </div>
  );
}
