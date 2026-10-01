import { NextResponse } from "next/server";
import { sendMail } from "../../../../lib/mail";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { to, subject, text, approvalToken } = await req.json();

    if (approvalToken !== "APPROVED") {
      return NextResponse.json({ error: "Human approval required" }, { status: 403 });
    }

    if (!Array.isArray(to) || to.length === 0 || !subject || !text) {
      return NextResponse.json({ error: "to, subject and text are required" }, { status: 400 });
    }

    if (to.length !== 1) {
      return NextResponse.json({ error: "Send endpoint accepts one recipient per approved send" }, { status: 400 });
    }

    const result = await sendMail(to[0], subject, text);

    return NextResponse.json({
      success: true,
      provider: process.env.MAIL_PROVIDER,
      from: process.env.MAIL_FROM_ADDRESS ?? null,
      messageId: result.id,
      threadId: result.threadId ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email send failed." },
      { status: 500 }
    );
  }
}
