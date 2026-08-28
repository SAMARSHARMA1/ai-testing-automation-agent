import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID;

  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: process.env.GITHUB_REDIRECT_URL!,
    scope: "repo",
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  );
}