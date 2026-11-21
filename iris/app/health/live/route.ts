import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Answers while Iris runs (`docs/engineering.md`, Health checks). */
export function GET() {
  return NextResponse.json({ status: "ok", service: "iris" });
}
