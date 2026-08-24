import { yoga } from "../src/server";

export default async function handler(req: any, res: any) {
  try {
    // Map Vercel internal function rewrites (/api/index or /api) back to '/' for root requests
    if (req.url === "/api/index" || req.url === "/api" || req.url === "") {
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
