import { yoga } from "../src/server";

export default async function handler(req: any, res: any) {
  try {
    const rawUrl = req.url || "/";
    const acceptHeader = req.headers?.accept || "";

    // Serve exact GraphQL Yoga Home Page on root GET requests
    if ((rawUrl === "/" || rawUrl === "" || rawUrl === "/api" || rawUrl === "/api/index") && req.method === "GET" && acceptHeader.includes("text/html")) {
      const yogaResponse = await yoga.fetch("http://localhost/graphql", {
        method: "GET",
        headers: { accept: "text/html" },
      });

      let html = await yogaResponse.text();

      // Strip the 404 text notice at the bottom if present, keeping the exact Welcome Home Page UI
      if (html.includes('<section class="not-what-your-looking-for">')) {
        html = html.split('<section class="not-what-your-looking-for">')[0] + '</body></html>';
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
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
