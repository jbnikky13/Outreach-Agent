import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "This legacy endpoint is disabled. Use a workspace-scoped, human-approved draft send." },
    { status: 410 }
  );
}
