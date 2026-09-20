import { NextRequest, NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

export async function POST(req: NextRequest) {
  try {
    const { statement, gap_explanation, existing_solutions, affected_users } = await req.json();

    const prompt = `Given this problem statement and its grounded analysis, brainstorm 3 possible business model directions.

Problem statement: "${statement}"
Gap: ${gap_explanation}
Existing solutions: ${existing_solutions}
Affected users: ${affected_users}

This is explicitly a speculative brainstorm, not a factual claim — you may propose plausible business models based on general knowledge of business models, clearly distinct from each other (e.g. different pricing models, different customer segments, different scopes). Keep each to 2-3 sentences.

Respond with ONLY a JSON object: {"ideas": [{"title": "...", "description": "..."}, ...]} with exactly 3 ideas.`;

    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        response_format: { type: "json_object" },
      }),
    });

    const data = await resp.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return NextResponse.json({ ideas: parsed.ideas ?? [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Could not generate ideas. Please try again." },
      { status: 500 }
    );
  }
}
