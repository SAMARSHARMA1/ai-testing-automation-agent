import { db, repositories } from "@/db";

import { eq } from "drizzle-orm";

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const {
            repoId,
            userId,
            name,
            full_name,
            private_,
            html_url,
            description,
            language,
            default_branch,
            owner,
        } = await req.json();

        console.log("===== SAVE REPOSITORY REQUEST =====");
        console.log({
            repoId,
            userId,
            name,
            full_name,
            owner,
            ownerType: typeof owner,
            default_branch,
        });
        console.log("===================================");

        if (!repoId || !userId || !name || !full_name) {
            return NextResponse.json(
                {
                    error: "Missing required repository information",
                },
                { status: 400 }
            );
        }

        // GitHub can return owner as:
        // { login: "SAMARSHARMA1" }
        //
        // Database requires owner to be a string.
        const ownerName =
            typeof owner === "string"
                ? owner
                : owner?.login;

        if (!ownerName) {
            return NextResponse.json(
                {
                    error: "Repository owner is missing",
                    receivedOwner: owner,
                },
                { status: 400 }
            );
        }

        const result = await db
            .insert(repositories)
            .values({
                repoId,
                userId,
                name,
                fullName: full_name,
                private: private_ ? 1 : 0,
                htmlUrl: html_url,
                description,
                language,
                owner: ownerName,
            })
            .returning();

        console.log("===== REPOSITORY SAVED =====");
        console.log(result[0]);
        console.log("============================");

        return NextResponse.json(result[0]);
    } catch (error: any) {
        console.error("===== SAVE REPOSITORY ERROR =====");
        console.error(error);
        console.error("=================================");

        return NextResponse.json(
            {
                error: "Failed to save repository",
                details:
                    error?.message ||
                    "Unknown database error",
            },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        const userId = searchParams.get("userId");

        const result = await db
            .select()
            .from(repositories)
            .where(
                // @ts-ignore
                eq(repositories.userId, userId)
            );

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("===== GET REPOSITORIES ERROR =====");
        console.error(error);
        console.error("==================================");

        return NextResponse.json(
            {
                error: "Failed to get repositories",
                details:
                    error?.message ||
                    "Unknown database error",
            },
            { status: 500 }
        );
    }
}
