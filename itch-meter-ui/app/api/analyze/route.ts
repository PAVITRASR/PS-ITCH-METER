import { NextRequest, NextResponse } from "next/server";

const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

type HNHit = {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
};

function scoreColor(days: number) {
  if (days <= 30) return 1.0;
  if (days <= 90) return 0.75;
  if (days <= 180) return 0.5;
  return 0.25;
}

function computeItchScore(posts: HNHit[]): number {
  if (posts.length === 0) return 0;
  const now = Date.now();
  let total = 0;

  for (const p of posts) {
    const engagement = (p.points ?? 0) + (p.num_comments ?? 0) * 2;
    let weight = 0.5;
    if (p.created_at) {
      const days = (now - new Date(p.created_at).getTime()) / 86400000;
      weight = scoreColor(days);
    }
    total += engagement * weight;
  }

  const diversityMultiplier = Math.min(posts.length, 5) / 5;
  const raw = total * (0.5 + 0.5 * diversityMultiplier);
  return Math.min(100, Math.round(10 * Math.log10(raw + 1) * 5 * 10) / 10);
}

async function extractKeywords(statement: string): Promise<string[]> {
  const body = {
    model: GROQ_MODEL,
    messages: [
      {
        role: "user",
        content: `Extract 3-5 short search-engine-style keyword phrases (2-4 words each) from this problem statement, suitable for searching Hacker News for related real discussions. Respond with ONLY a JSON object: {"keywords": ["phrase1", "phrase2", ...]}\n\nProblem statement: "${statement}"`,
      },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return parsed.keywords ?? [];
}

async function searchHN(keyword: string): Promise<HNHit[]> {
  const params = new URLSearchParams({
    query: keyword,
    tags: "story",
    hitsPerPage: "15",
  });
  const resp = await fetch(`${HN_SEARCH_URL}?${params}`);
  const data = await resp.json();
  return data.hits ?? [];
}

async function analyzeWithGroq(statement: string, posts: HNHit[]) {
  const postsBlock = posts
    .map(
      (p, i) =>
        `[${i}] title="${p.title ?? p.story_title}" | points=${p.points ?? 0} | comments=${p.num_comments ?? 0} | url=${p.url ?? `https://news.ycombinator.com/item?id=${p.objectID}`}`
    )
    .join("\n");

  const prompt = `A user has proposed this problem statement: "${statement}"

Below are REAL Hacker News posts found by searching for related keywords. Use ONLY these posts as evidence.

STRICT RULES:
- Do not invent facts, competitors, or user segments not grounded in the posts below.
- If the posts show this problem is already well-served by existing solutions, set "gap_exists" to false and explain why, citing which posts show this.
- If the posts show genuine ongoing frustration/unmet need, set "gap_exists" to true.
- If there is insufficient real evidence either way, say so honestly rather than guessing.
- "affected_users" must be inferred only from who is posting/discussing in the real posts, or "insufficient evidence" if unclear.

REAL POSTS FOUND:
${postsBlock || "(no relevant posts found)"}

Respond with ONLY a JSON object with these fields:
- "gap_exists": boolean
- "gap_explanation": string, grounded in the posts, or "insufficient evidence" if posts are empty/irrelevant
- "existing_solutions": string, grounded in the posts, or "unknown"
- "affected_users": string, grounded in the posts, or "insufficient evidence"
- "relevant_post_indices": array of [N] indices from the list above that were actually relevant and used (empty array if none were relevant)`;

  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  const data = await resp.json();
  return JSON.parse(data.choices[0].message.content);
}

export async function POST(req: NextRequest) {
  try {
    const { statement } = await req.json();
    if (!statement || typeof statement !== "string" || statement.trim().length < 10) {
      return NextResponse.json(
        { error: "Please provide a longer problem statement (at least 10 characters)." },
        { status: 400 }
      );
    }

    const keywords = await extractKeywords(statement);
    const allPosts: HNHit[] = [];
    const seen = new Set<string>();

    for (const kw of keywords) {
      const hits = await searchHN(kw);
      for (const h of hits) {
        if (!seen.has(h.objectID) && (h.title || h.story_title)) {
          seen.add(h.objectID);
          allPosts.push(h);
        }
      }
    }

    const analysis = await analyzeWithGroq(statement, allPosts);
    const relevantIndices: number[] = analysis.relevant_post_indices ?? [];
    const relevantPosts = relevantIndices
      .map((i) => allPosts[i])
      .filter(Boolean);

    const itchScore = computeItchScore(relevantPosts);

    return NextResponse.json({
      itch_score: itchScore,
      gap_exists: analysis.gap_exists,
      gap_explanation: analysis.gap_explanation,
      existing_solutions: analysis.existing_solutions,
      affected_users: analysis.affected_users,
      sources: relevantPosts.map((p) => ({
        title: p.title ?? p.story_title,
        url: p.url ?? `https://news.ycombinator.com/item?id=${p.objectID}`,
        points: p.points ?? 0,
        num_comments: p.num_comments ?? 0,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
