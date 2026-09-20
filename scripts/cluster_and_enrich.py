"""
Clustering + enrichment script for Problem Statement Itch Meter.

Reads raw_posts from Supabase, sends batches to Gemini (free tier) to:
1. Cluster similar complaints into distinct problem statements
2. Enrich each cluster with gap, existing solutions, affected users, scope

Writes results into `problem_statements` table, linked back to source posts.

Anti-hallucination design:
- The model is only ever shown REAL post titles/urls/points it must ground on
- It's explicitly told to say "unknown" rather than invent facts
- Every output problem statement carries source_post_ids back to raw_posts
"""

import os
import json
import requests
from datetime import datetime, timedelta, timezone

# ---- CONFIG ----
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
GROQ_API_KEY = os.environ["GROQ_API_KEY"]

DOMAIN = "fintech"
GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def fetch_raw_posts(domain, limit=60):
    """Pull raw posts for a domain from Supabase, most-discussed first."""
    url = f"{SUPABASE_URL}/rest/v1/raw_posts"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    params = {
        "domain": f"eq.{domain}",
        "order": "points.desc",
        "limit": str(limit),
    }
    resp = requests.get(url, headers=headers, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def build_prompt(posts):
    """Construct the anti-hallucination clustering + enrichment prompt."""
    posts_block = "\n".join(
        f"[{i}] id={p['id']} | title=\"{p['title']}\" | points={p['points']} | "
        f"comments={p['num_comments']} | url={p['url']}"
        for i, p in enumerate(posts)
    )

    return f"""You are analyzing REAL posts scraped from Hacker News about the "{DOMAIN}" domain.
Below is a numbered list of real posts with their database IDs.

STRICT RULES:
- Base every statement ONLY on the posts given below. Do not invent problems, competitors, or facts not present in these posts.
- If a post's title alone doesn't give enough detail to be confident about the gap/users, say "unknown" or "insufficient detail" rather than guessing.
- Group posts that describe the SAME or closely related underlying problem into one cluster. Skip posts that are just product announcements ("Show HN: I built...") with no clear complaint/problem UNLESS the product name itself implies a specific unmet need.
- Only create a cluster if you have reasonable grounding (at least 1 real post) — never create a cluster from nothing.

POSTS:
{posts_block}

For each cluster you find, output a JSON object with these exact fields:
- "title": short problem statement title (your synthesis, grounded in the posts)
- "summary": 2-3 sentences describing the problem, based only on the posts
- "gap": what's currently missing/underserved, based on the posts (or "unknown" if unclear)
- "existing_solutions": known existing tools/competitors mentioned or clearly implied by the posts (or "unknown")
- "affected_users": who is affected, inferred from who is posting/discussing (or "unknown")
- "scope_estimate": one of "weekend", "semester", or "funded-team" — your best estimate of how big a project solving this would be
- "confidence": "low" if only 1 source post, "medium" if 2-3, "high" if 4+
- "source_indices": list of the [N] index numbers of posts used for this cluster (referencing the numbers above, NOT the ids directly)

Respond with ONLY a JSON object of the form {{"clusters": [ ... ]}}, where each element of the "clusters" array is an object with the fields described above. No other text, no markdown fences."""


def call_groq(prompt):
    """Send prompt to Groq (gpt-oss-120b) and return parsed JSON array."""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(GROQ_URL, headers=headers, json=body, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    text = data["choices"][0]["message"]["content"]
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        print("  ! Raw model output that failed to parse:")
        print(text[:1000])
        raise

    # json_object mode requires a top-level object, so we ask for {"clusters": [...]}
    if isinstance(parsed, dict) and "clusters" in parsed:
        return parsed["clusters"]
    if isinstance(parsed, list):
        return parsed
    return []


def compute_itch_score(source_posts):
    """
    Pure-math itch score from real post metrics. No AI involved.
    - Raw engagement: upvotes + comments (weighted higher, since replying takes more effort)
    - Recency weight: posts from the last 30 days count full, older posts decay
    - Source diversity: more distinct posts backing a problem = more confidence
    """
    if not source_posts:
        return 0.0

    now = datetime.now(timezone.utc)
    total_engagement = 0.0

    for p in source_posts:
        points = p.get("points") or 0
        comments = p.get("num_comments") or 0
        engagement = points + (comments * 2)

        created_str = p.get("created_at_source")
        recency_weight = 0.5  # default if no date available
        if created_str:
            try:
                created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                days_old = (now - created).days
                if days_old <= 30:
                    recency_weight = 1.0
                elif days_old <= 90:
                    recency_weight = 0.75
                elif days_old <= 180:
                    recency_weight = 0.5
                else:
                    recency_weight = 0.25
            except ValueError:
                pass

        total_engagement += engagement * recency_weight

    source_diversity_multiplier = min(len(source_posts), 5) / 5  # caps at 5 sources
    raw_score = total_engagement * (0.5 + 0.5 * source_diversity_multiplier)

    # Normalize to a friendlier 0-100 scale (log-ish compression so outliers don't dominate)
    import math
    normalized = min(100, round(10 * math.log10(raw_score + 1) * 5, 1))
    return normalized


def insert_problem_statements(clusters, posts):
    """Map source_indices back to real post UUIDs and insert into Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/problem_statements"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    rows = []
    for c in clusters:
        indices = c.get("source_indices", [])
        source_posts = [posts[i] for i in indices if 0 <= i < len(posts)]
        if not source_posts:
            continue  # never insert an ungrounded problem statement

        rows.append({
            "domain": DOMAIN,
            "title": c.get("title", "Untitled"),
            "summary": c.get("summary", ""),
            "gap": c.get("gap", "unknown"),
            "existing_solutions": c.get("existing_solutions", "unknown"),
            "affected_users": c.get("affected_users", "unknown"),
            "scope_estimate": c.get("scope_estimate", "unknown"),
            "confidence": c.get("confidence", "low"),
            "source_post_ids": [p["id"] for p in source_posts],
            "itch_score": compute_itch_score(source_posts),
        })

    if rows:
        resp = requests.post(url, headers=headers, json=rows, timeout=30)
        if resp.status_code not in (200, 201, 204):
            print(f"  ! Insert failed ({resp.status_code}): {resp.text[:400]}")
        else:
            print(f"  Inserted {len(rows)} problem statements")
    else:
        print("  No groundable clusters to insert.")


def main():
    print(f"Fetching raw posts for domain: {DOMAIN}")
    posts = fetch_raw_posts(DOMAIN)
    print(f"  Got {len(posts)} posts")

    if not posts:
        print("No posts found — run the scraper first.")
        return

    print("Sending to Groq for clustering + enrichment...")
    prompt = build_prompt(posts)
    clusters = call_groq(prompt)
    print(f"  Groq returned {len(clusters)} clusters")

    insert_problem_statements(clusters, posts)
    print("\nDone. Check your Supabase 'problem_statements' table.")


if __name__ == "__main__":
    main()
