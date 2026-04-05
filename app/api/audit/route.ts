import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { extractPageInfo } from "@/app/lib/extractPageInfo";
import { buildPrompt } from "@/app/lib/buildPrompt";
import type { AuditRequest, AuditResult } from "@/app/lib/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

async function fetchPageHTML(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; UXAuditor/1.0)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: AuditRequest = await req.json();
    const { url, checks, language = "en" } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Malformed URL — include https://" },
        { status: 400 }
      );
    }

    const html = await fetchPageHTML(parsedUrl.href);
    const pageInfo = extractPageInfo(
      html || "<html><head><title></title></head><body></body></html>"
    );

    const prompt = buildPrompt(pageInfo, parsedUrl.href, checks, language);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    const clean = rawText.replace(/```json|```/g, "").trim();
    const audit: AuditResult = JSON.parse(clean);

    return NextResponse.json({ audit });
  } catch (err) {
    console.error("[audit] error:", err);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}