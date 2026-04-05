import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { title, description, category, severity, language } = await req.json();

    const langInstruction =
      language === "es"
        ? "Respond entirely in Spanish."
        : "Respond in English.";

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `${langInstruction}

You are a UX expert. Explain this UX issue in simple, practical terms for a developer or designer. Keep it under 120 words. Be concrete, avoid jargon.

Issue: "${title}"
Description: "${description}"
Category: ${category}
Severity: ${severity}

Explain: why this matters for users, and give 1 quick concrete example of how to fix it.`,
        },
      ],
    });

    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    return NextResponse.json({ explanation: text });
  } catch (err) {
    console.error("[explain] error:", err);
    return NextResponse.json(
      { error: "Could not generate explanation." },
      { status: 500 }
    );
  }
}