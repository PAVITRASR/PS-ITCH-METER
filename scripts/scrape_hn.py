"""
Hacker News scraper for Problem Statement Itch Meter.
Pulls real posts matching domain keywords from HN's Algolia Search API
(no auth needed) and inserts them into Supabase `raw_posts` table.
"""

import os
import requests
from datetime import datetime, timedelta

# ---- CONFIG ----
SUPABASE_URL = os.environ["SUPABASE_URL"]          # e.g. https://xxxx.supabase.co
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

DOMAIN = "fintech"
KEYWORDS = [
    "fintech frustrating",
    "banking app hate",
    "payment processing broken",
    "invoicing pain",
    "expense tracking annoying",
    "wish there was a fintech",
    "budgeting app problem",
    "credit card fees hate",
    "stripe alternative",
    "accounting software pain",
    "personal finance frustrating",
    "tax software broken",
    "cross border payments slow",
    "crypto wallet annoying",
    "subscription billing pain",
    "small business banking problem",
]

HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"


def fetch_hn_posts(query, days_back=180, hits_per_page=50):
    """Fetch HN posts matching a query from the last N days."""
    since_timestamp = int((datetime.now() - timedelta(days=days_back)).timestamp())
    params = {
        "query": query,
        "tags": "story",
        "numericFilters": f"created_at_i>{since_timestamp}",
        "hitsPerPage": hits_per_page,
    }
    resp = requests.get(HN_SEARCH_URL, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json().get("hits", [])


def insert_into_supabase(rows):
    """Insert rows into Supabase raw_posts table via REST API, skipping duplicates."""
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/raw_posts?on_conflict=raw_id"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates",  # skip rows with duplicate raw_id
    }
    resp = requests.post(url, headers=headers, json=rows, timeout=30)
    if resp.status_code not in (200, 201):
        print(f"  ! Insert failed ({resp.status_code}): {resp.text[:300]}")
    else:
        print(f"  Inserted {len(rows)} rows (duplicates skipped automatically)")


def main():
    total_fetched = 0
    for keyword in KEYWORDS:
        print(f"Searching HN for: '{keyword}'")
        hits = fetch_hn_posts(keyword)
        print(f"  Found {len(hits)} raw hits")

        rows = []
        for hit in hits:
            title = hit.get("title") or hit.get("story_title")
            if not title:
                continue  # skip comments-only hits with no title

            rows.append({
                "source": "hackernews",
                "domain": DOMAIN,
                "title": title,
                "body": hit.get("story_text") or "",
                "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit['objectID']}",
                "points": hit.get("points") or 0,
                "num_comments": hit.get("num_comments") or 0,
                "created_at_source": hit.get("created_at"),
                "raw_id": hit["objectID"],
            })

        insert_into_supabase(rows)
        total_fetched += len(rows)

    print(f"\nDone. Total posts processed: {total_fetched}")
    print("Check your Supabase 'raw_posts' table to confirm.")


if __name__ == "__main__":
    main()
