export {};

type Draft = { subject: string; body: string; personalization_note?: string };

async function main(): Promise<void> {
  const campaign = {
    name: "Smoke Test",
    topic: "A hypothetical workflow test",
    goal: "Request feedback",
    audience: "Technology teams",
    talking_points: "Keep the message concise and factual.",
    tone: "Professional",
    personalization_instructions: "Do not invent facts."
  };

  const prospect = {
    name: "Test Recipient",
    company: "Example Company",
    email: "test@example.com",
    reason: "Testing the outreach draft generator"
  };

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");

  const promptText = [
    "You write a concise B2B outreach email.",
    "Never invent facts.",
    "Return ONLY valid JSON with subject, body, personalization_note.",
    "CAMPAIGN",
    JSON.stringify(campaign),
    "PROSPECT",
    JSON.stringify(prospect)
  ].join("\n");

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(key),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
      })
    }
  );

  const data: unknown = await response.json();
  if (!response.ok) {
    const errorData = data as { error?: { message?: string } };
    throw new Error("Gemini smoke test failed: " + (errorData.error?.message ?? "Unknown error"));
  }

  const responseData = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Gemini returned no content");

  const draft = JSON.parse(raw) as Partial<Draft>;
  if (typeof draft.subject !== "string" || typeof draft.body !== "string") {
    throw new Error("Invalid draft shape");
  }

  console.log("AI draft generation passed.");
  console.log("Subject:", draft.subject);
  console.log("Body preview:", draft.body.slice(0, 180));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
