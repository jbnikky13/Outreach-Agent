import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Campaign = {
  name: string;
  topic: string;
  goal: string;
  audience: string;
  talking_points: string;
  tone: string;
  personalization_instructions: string;
};

type Prospect = {
  name: string;
  company: string;
  email: string;
  reason: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing " + name);
  return value;
}

export async function POST(request: Request) {
  try {
    const { campaign, prospect } = (await request.json()) as {
      campaign: Campaign;
      prospect: Prospect;
    };

    if (!campaign?.topic || !prospect?.email) {
      return NextResponse.json(
        { error: "Campaign topic and prospect are required." },
        { status: 400 }
      );
    }

    const apiKey = required("GEMINI_API_KEY");

    const prompt = [
      "You write concise, credible B2B outreach emails.",
      "Follow the campaign exactly.",
      "Never invent facts, achievements, partnerships, metrics, funding, customers, or personal details about the prospect.",
      "Use only the supplied prospect information.",
      "Do not mention that AI was used.",
      "",
      "CAMPAIGN",
      "Name: " + campaign.name,
      "Topic: " + campaign.topic,
      "Goal: " + campaign.goal,
      "Audience: " + campaign.audience,
      "Talking points: " + campaign.talking_points,
      "Tone: " + campaign.tone,
      "Personalization instructions: " + campaign.personalization_instructions,
      "",
      "PROSPECT",
      "Name: " + prospect.name,
      "Company: " + prospect.company,
      "Known reason for outreach: " + prospect.reason,
      "",
      "Return ONLY valid JSON with this shape:",
      '{"subject":"...","body":"...","personalization_note":"..."}',
      "The body should be 100-160 words, natural, specific to the supplied information, and end with one simple call to action."
    ].join("\n");

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data: unknown = await response.json();

    if (!response.ok) {
      const errorData = data as { error?: { message?: string } };
      return NextResponse.json(
        {
          error:
            "AI generation failed: " +
            (errorData.error?.message ?? "Unknown provider error")
        },
        { status: 502 }
      );
    }

    const responseData = data as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      return NextResponse.json(
        { error: "AI returned no draft." },
        { status: 502 }
      );
    }

    const draft = JSON.parse(raw) as {
      subject?: unknown;
      body?: unknown;
      personalization_note?: unknown;
    };

    if (typeof draft.subject !== "string" || typeof draft.body !== "string") {
      throw new Error("AI returned an invalid draft.");
    }

    return NextResponse.json({
      subject: draft.subject.trim(),
      body: draft.body.trim(),
      personalization_note:
        typeof draft.personalization_note === "string"
          ? draft.personalization_note.trim()
          : ""
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Draft generation failed."
      },
      { status: 500 }
    );
  }
}
