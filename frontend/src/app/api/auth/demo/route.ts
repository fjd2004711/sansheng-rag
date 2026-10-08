import { NextResponse } from "next/server";

import { loginWithPassword } from "@/lib/server-login";

/**
 * Optional demo auto-login. Enabled only when DEMO_LOGIN_EMAIL and DEMO_LOGIN_PASSWORD are set in the
 * server environment (never NEXT_PUBLIC_*): anyone who can reach the site then enters as that
 * account, so use a non-admin account and only on a trusted network.
 */
export async function POST() {
  const email = process.env.DEMO_LOGIN_EMAIL;
  const password = process.env.DEMO_LOGIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ detail: "未启用演示登录" }, { status: 404 });
  }
  return loginWithPassword(email, password);
}
