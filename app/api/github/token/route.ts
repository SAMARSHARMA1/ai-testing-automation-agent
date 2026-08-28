import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("gh_token")?.value;

    if (!token) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "GitHub token not found",
        },
        { status: 401 }
      );
    }

    console.log("GitHub token found:", !!token);

    return NextResponse.json({
      authenticated: true,
      token: token,
    });
  } catch (error) {
    console.error("GitHub token API error:", error);

    return NextResponse.json(
      {
        authenticated: false,
        error: "Failed to get GitHub token",
      },
      { status: 500 }
    );
  }
}