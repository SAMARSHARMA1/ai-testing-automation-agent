import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { db, TestCasesTable } from "@/db";
import { cookies } from "next/headers";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const ALLOWED_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".md",
];

const IMPORTANT_FILES = [
  "package.json",
  "next.config",
  "middleware",
  "app/",
  "pages/",
  "components/",
  "src/",
  "lib/",
  "utils/",
  "actions/",
  "api/",
  "server/",
];

const IGNORE_PATHS = [
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
  "coverage",
  "public/",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".webp",
  ".mp4",
  ".mov",
];

function isUsefulFile(path: string) {
  const isIgnored = IGNORE_PATHS.some((item) =>
    path.includes(item)
  );

  const isAllowedExtension = ALLOWED_EXTENSIONS.some((ext) =>
    path.endsWith(ext)
  );

  const isImportantPath = IMPORTANT_FILES.some((item) =>
    path.includes(item)
  );

  return (
    !isIgnored &&
    isAllowedExtension &&
    isImportantPath
  );
}

/* ============================================================
   GET REPOSITORY TREE
============================================================ */

async function getRepoTree({
  owner,
  repo,
  githubToken,
}: {
  owner: string;
  repo: string;
  githubToken: string;
}) {
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  /* ============================================================
     1. VERIFY GITHUB TOKEN
  ============================================================ */

  const userResponse = await fetch(
    "https://api.github.com/user",
    {
      headers,
      cache: "no-store",
    }
  );

  const userData = await userResponse.json();

  console.log("===== GITHUB TOKEN CHECK =====");
  console.log("Status:", userResponse.status);
  console.log("Authenticated user:", userData.login);
  console.log("Message:", userData.message);
  console.log("==============================");

  if (!userResponse.ok) {
    throw new Error(
      `GitHub token is invalid: ${userResponse.status} ${
        userData.message || ""
      }`
    );
  }

  /* ============================================================
     2. GET REPOSITORY INFORMATION
  ============================================================ */

  console.log("===== REPOSITORY REQUEST =====");
  console.log("Owner:", owner);
  console.log("Repo:", repo);
  console.log("==============================");

  const repoUrl =
    `https://api.github.com/repos/` +
    `${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}`;

  const repoResponse = await fetch(repoUrl, {
    headers,
    cache: "no-store",
  });

  const repoData = await repoResponse.json();

  console.log("===== REPOSITORY RESPONSE =====");
  console.log("Status:", repoResponse.status);
  console.log("Full name:", repoData.full_name);
  console.log("Default branch:", repoData.default_branch);
  console.log("Message:", repoData.message);
  console.log("===============================");

  if (!repoResponse.ok) {
    throw new Error(
      `GitHub repository failed: ${repoResponse.status} ${
        repoData.message || repoResponse.statusText
      }`
    );
  }

  /* ============================================================
     3. ALWAYS USE GITHUB'S REAL DEFAULT BRANCH
  ============================================================ */

  const actualBranch = repoData.default_branch;

  if (!actualBranch) {
    throw new Error(
      "GitHub did not return a default branch for this repository"
    );
  }

  console.log("Using actual repository branch:", actualBranch);

  /* ============================================================
     4. GET BRANCH INFORMATION
  ============================================================ */

  const branchUrl =
    `https://api.github.com/repos/` +
    `${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}/branches/` +
    `${encodeURIComponent(actualBranch)}`;

  const branchResponse = await fetch(branchUrl, {
    headers,
    cache: "no-store",
  });

  const branchData = await branchResponse.json();

  console.log("===== BRANCH RESPONSE =====");
  console.log("Status:", branchResponse.status);
  console.log("Branch:", actualBranch);
  console.log("SHA:", branchData.commit?.sha);
  console.log("Message:", branchData.message);
  console.log("===========================");

  if (!branchResponse.ok) {
    throw new Error(
      `GitHub branch failed: ${branchResponse.status} ${
        branchData.message || branchResponse.statusText
      }`
    );
  }

  const treeSha = branchData.commit?.sha;

  if (!treeSha) {
    throw new Error(
      "Could not determine repository tree SHA"
    );
  }

  /* ============================================================
     5. GET GITHUB TREE USING SHA
  ============================================================ */

  const treeUrl =
    `https://api.github.com/repos/` +
    `${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}` +
    `/git/trees/${treeSha}?recursive=1`;

  console.log("===== TREE REQUEST =====");
  console.log("URL:", treeUrl);
  console.log("Tree SHA:", treeSha);
  console.log("========================");

  const res = await fetch(treeUrl, {
    headers,
    cache: "no-store",
  });

  const data = await res.json();

  console.log("===== GITHUB TREE =====");
  console.log("Status:", res.status);
  console.log("Message:", data.message);
  console.log("Files:", data.tree?.length);
  console.log("=======================");

  if (!res.ok) {
    throw new Error(
      `GitHub API failed: ${res.status} ${
        data.message || res.statusText
      }`
    );
  }

  if (!Array.isArray(data.tree)) {
    throw new Error(
      "GitHub repository tree is missing"
    );
  }

  const usefulFiles = data.tree
    .filter((item: any) => item.type === "blob")
    .filter((item: any) => isUsefulFile(item.path))
    .slice(0, 25);

  return {
    branch: actualBranch,
    files: usefulFiles,
  };
}

/* ============================================================
   READ GITHUB FILE
============================================================ */

async function readGithubFile({
  owner,
  repo,
  path,
  branch,
  githubToken,
}: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  githubToken: string;
}) {
  const url =
    `https://api.github.com/repos/` +
    `${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}` +
    `/contents/${path}?ref=${encodeURIComponent(branch)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    console.error(
      `Failed to read GitHub file ${path}:`,
      res.status,
      await res.text()
    );

    return null;
  }

  const data = await res.json();

  if (!data.content) {
    return null;
  }

  const decodedContent = Buffer.from(
    data.content,
    "base64"
  ).toString("utf-8");

  return {
    path,
    content: decodedContent.slice(0, 5000),
  };
}

/* ============================================================
   POST
============================================================ */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log(
      "===== GENERATE TEST CASES REQUEST ====="
    );

    console.log("Body:", {
      userId: body.userId,
      repoId: body.repoId,
      owner: body.owner,
      repo: body.repo,
      branch: body.branch,
    });

    const cookieStore = await cookies();

    const githubToken =
      cookieStore.get("gh_token")?.value;

    const {
      userId,
      repoId,
      owner,
      repo,
    } = body;

    /* ============================================================
       VALIDATE REQUEST
    ============================================================ */

    if (!userId) {
      return NextResponse.json(
        {
          error: "userId is required",
        },
        { status: 400 }
      );
    }

    if (!repoId) {
      return NextResponse.json(
        {
          error: "repoId is required",
        },
        { status: 400 }
      );
    }

    if (!owner) {
      return NextResponse.json(
        {
          error: "owner is required",
        },
        { status: 400 }
      );
    }

    if (!repo) {
      return NextResponse.json(
        {
          error: "repo is required",
        },
        { status: 400 }
      );
    }

    if (!githubToken) {
      return NextResponse.json(
        {
          error:
            "GitHub token not found. Please connect GitHub again.",
        },
        { status: 401 }
      );
    }

    console.log("===== AUTH CHECK =====");
    console.log(
      "GitHub token exists:",
      !!githubToken
    );
    console.log(
      "GitHub token length:",
      githubToken.length
    );
    console.log("======================");

    /* ============================================================
       1. GET REPOSITORY TREE
    ============================================================ */

    let repoResult;

    try {
      repoResult = await getRepoTree({
        owner,
        repo,
        githubToken,
      });
    } catch (error: any) {
      console.error(
        "GitHub repository error:",
        error
      );

      return NextResponse.json(
        {
          error: "Failed to read GitHub repository",
          details:
            error.message ||
            "Unknown GitHub error",
        },
        { status: 502 }
      );
    }

    const actualBranch = repoResult.branch;
    const repoFiles = repoResult.files;

    console.log(
      "Actual repository branch:",
      actualBranch
    );

    console.log(
      "Useful repository files:",
      repoFiles.length
    );

    if (repoFiles.length === 0) {
      return NextResponse.json(
        {
          error:
            "No useful source files found in this repository",
        },
        { status: 400 }
      );
    }

    /* ============================================================
       2. READ REPOSITORY FILES
    ============================================================ */

    const fileContents = await Promise.all(
      repoFiles.map((file: any) =>
        readGithubFile({
          owner,
          repo,
          branch: actualBranch,
          path: file.path,
          githubToken,
        })
      )
    );

    const validFiles = fileContents.filter(
      Boolean
    ) as {
      path: string;
      content: string;
    }[];

    console.log(
      "Successfully read files:",
      validFiles.length
    );

    if (validFiles.length === 0) {
      return NextResponse.json(
        {
          error:
            "Could not read any useful source files",
        },
        { status: 400 }
      );
    }

    /* ============================================================
       3. PREPARE REPOSITORY CONTEXT
    ============================================================ */

    const repoContext = validFiles
      .map(
        (file) =>
          `File Path: ${file.path}

File Content:

${file.content}`
      )
      .join(
        "\n\n----------------------\n\n"
      );

    console.log(
      "Repository context length:",
      repoContext.length
    );

    /* ============================================================
       4. GENERATE TEST CASES WITH GEMINI
    ============================================================ */

    let response;

    try {
      response =
        await ai.models.generateContent({
          model: "gemini-3.1-flash-lite",

          contents: `
You are an expert QA automation engineer.

Analyze the GitHub repository source code and generate useful small test cases.

Generate 5 to 10 test cases.

Repository:

Owner: ${owner}

Repo: ${repo}

Branch: ${actualBranch}

Repository File Context:

${repoContext}

Each test case must include:

- title
- description
- type: ui, auth, api, form, integration, edge-case
- priority: low, medium, high
- targetRoute
- targetFiles
- expectedResult

Rules:

- Only use file paths that exist in the repository context.
- Do not invent fake target files.
- If the route is unclear, infer it from the repository.
- Keep descriptions short.
`,

          config: {
            responseMimeType:
              "application/json",

            responseSchema: {
              type: Type.OBJECT,

              properties: {
                testCases: {
                  type: Type.ARRAY,

                  items: {
                    type: Type.OBJECT,

                    properties: {
                      title: {
                        type: Type.STRING,
                      },

                      description: {
                        type: Type.STRING,
                      },

                      type: {
                        type: Type.STRING,

                        enum: [
                          "ui",
                          "auth",
                          "api",
                          "form",
                          "integration",
                          "edge-case",
                        ],
                      },

                      priority: {
                        type: Type.STRING,

                        enum: [
                          "low",
                          "medium",
                          "high",
                        ],
                      },

                      targetRoute: {
                        type: Type.STRING,
                      },

                      targetFiles: {
                        type: Type.ARRAY,

                        items: {
                          type: Type.STRING,
                        },
                      },

                      expectedResult: {
                        type: Type.STRING,
                      },
                    },

                    required: [
                      "title",
                      "description",
                      "type",
                      "priority",
                      "targetRoute",
                      "targetFiles",
                      "expectedResult",
                    ],
                  },
                },
              },

              required: ["testCases"],
            },
          },
        });
    } catch (error: any) {
      console.error(
        "===== GEMINI ERROR ====="
      );

      console.error(error);

      console.error(
        "========================"
      );

      return NextResponse.json(
        {
          error: "Gemini API failed",
          details:
            error.message ||
            String(error),
        },
        { status: 502 }
      );
    }

    console.log(
      "Gemini response received"
    );

    /* ============================================================
       5. PARSE GEMINI RESPONSE
    ============================================================ */

    let aiResult;

    try {
      aiResult = JSON.parse(
        response.text || "{}"
      );
    } catch (error) {
      console.error(
        "Gemini JSON parse error:",
        error
      );

      console.error(
        "Gemini raw response:",
        response.text
      );

      return NextResponse.json(
        {
          error:
            "Gemini returned invalid JSON",
          rawResponse: response.text,
        },
        { status: 502 }
      );
    }

    const testCases =
      aiResult.testCases || [];

    console.log(
      "Generated test cases:",
      testCases.length
    );

    if (!testCases.length) {
      return NextResponse.json(
        {
          error:
            "Gemini did not generate any test cases",
        },
        { status: 400 }
      );
    }

    /* ============================================================
       6. SAVE TO DATABASE
    ============================================================ */

    let insertedTestCases;

    try {
      insertedTestCases =
        await db
          .insert(TestCasesTable)
          .values(
            testCases.map(
              (testCase: any) => ({
                userId,
                repoId,
                repoName: repo,
                repoOwner: owner,
                branch: actualBranch,

                title:
                  testCase.title,

                description:
                  testCase.description,

                type:
                  testCase.type,

                priority:
                  testCase.priority,

                targetRoute:
                  testCase.targetRoute,

                targetFiles:
                  testCase.targetFiles ||
                  [],

                expectedResult:
                  testCase.expectedResult,

                status: "generated",
              })
            )
          )
          .returning();
    } catch (error: any) {
      console.error(
        "===== DATABASE ERROR ====="
      );

      console.error(error);

      console.error(
        "=========================="
      );

      return NextResponse.json(
        {
          error:
            "Failed to save generated test cases",

          details:
            error.message ||
            String(error),
        },
        { status: 500 }
      );
    }

    console.log(
      `Successfully inserted ${insertedTestCases.length} test cases`
    );

    /* ============================================================
       SUCCESS
    ============================================================ */

    return NextResponse.json({
      success: true,
      message:
        "Test cases generated successfully",

      count:
        insertedTestCases.length,

      testCases:
        insertedTestCases,
    });
  } catch (error: any) {
    console.error(
      "===== GENERATE TEST CASES ERROR ====="
    );

    console.error(error);

    console.error(
      "======================================"
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "Failed to generate test cases",
      },
      { status: 500 }
    );
  }
}