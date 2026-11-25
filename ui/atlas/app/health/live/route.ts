import { connection, NextResponse } from "next/server";

/** Answers while Atlas runs (`docs/engineering.md`, Health checks). */
export async function GET() {
  // Answered at request time, never prerendered.
  await connection();
  return NextResponse.json({ status: "ok", service: "atlas" });
}
