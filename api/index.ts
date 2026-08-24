import { yoga } from "../src/server";

export default async function handler(req: any, res: any) {
  try {
    const rawUrl = req.url || "/";
    const acceptHeader = req.headers?.accept || "";

    // Serve GraphQL Yoga landing page HTML on landing GET requests, stripping 404 notice text
    if (req.method === "GET" && acceptHeader.toLowerCase().includes("text/html") && !rawUrl.startsWith("/graphql")) {
      const yogaResponse = await yoga.fetch("http://localhost/", {
        method: "GET",
        headers: { accept: "text/html" },
      });

      let html = await yogaResponse.text();

      // Strip the 404 text notice section at the bottom, leaving only the official Landing Page UI
      const targetIdx = html.indexOf("Not the page you are looking for");
      if (targetIdx !== -1) {
        const secStart = html.lastIndexOf("<section", targetIdx);
        if (secStart !== -1) {
          html = html.substring(0, secStart) + "</main></body></html>";
        }
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
