import { yoga } from "../src/server";

export default async function handler(req: any, res: any) {
  try {
    const rawUrl = req.url || "/";
    
    // Preserve /graphql endpoint or map root /api rewrites to / so Yoga renders the Landing Home Page
    if (rawUrl === "/api/index" || rawUrl === "/api" || rawUrl === "") {
      req.url = "/";
    }

    return await yoga(req, res);
  } catch (error: any) {
    console.error("Vercel Serverless Function Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Internal Server Error",
        message: error?.message || "An unexpected error occurred in the serverless function.",
      })
    );
  }
}
