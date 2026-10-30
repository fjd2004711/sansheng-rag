import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/server-api";

/** Public: lets the sign-in pages know whether self-registration is open. */
export async function GET() {
  try {
    const data = await backendFetch<{ registration_open: boolean }>("/api/v1/auth/config");
    return NextResponse.json(data);
  } catch {
    // If the backend can't say, let the form show its own error on submit rather than hiding it.
    return NextResponse.json({ registration_open: true });
  }
}
