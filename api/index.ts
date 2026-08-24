import { yoga } from "../src/server";

export default async function handler(req: any, res: any) {
  try {
    // Standardize root request URL to '/' so Yoga renders its official Welcome Home Page
    if (req.url === "/api" || req.url === "/api/index" || req.url === "") {
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
