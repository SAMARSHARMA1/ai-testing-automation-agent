import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "GitHub authorization code missing" },
        { status: 400 }
      );
    }

    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: process.env.GITHUB_REDIRECT_URL,
        }),
      }
    );

    const data = await response.json();

    console.log("GitHub OAuth result:", {
      status: response.status,
      hasToken: !!data.access_token,
      tokenType: data.token_type,
      scope: data.scope,
      error: data.error,
      errorDescription: data.error_description,
    });

    if (!response.ok || !data.access_token) {
      return NextResponse.json(
        {
          error: "GitHub OAuth failed",
          details: data,
        },
        { status: 400 }
      );
    }

    // Validate the token immediately
    const githubUserResponse = await fetch(
      "https://api.github.com/user",
      {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
        },
      }
    );

    const githubUser = await githubUserResponse.json();

    console.log("GitHub user validation:", {
      status: githubUserResponse.status,
      login: githubUser.login,
      message: githubUser.message,
    });

    if (!githubUserResponse.ok) {
      return NextResponse.json(
        {
          error: "GitHub returned an invalid access token",
          details: githubUser,
        },
        { status: 401 }
      );
    }

    const res = NextResponse.redirect(
      new URL("/workspace", req.url)
    );

    res.cookies.set("gh_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (error: any) {
    console.error("GitHub callback error:", error);

    return NextResponse.json(
      {
        error: error.message || "GitHub OAuth callback failed",
      },
      { status: 500 }
    );
  }
}
