import { yoga } from "../src/server";

const HOME_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GraphQL Yoga</title>
  <link rel="icon" href="https://raw.githubusercontent.com/graphql-hive/graphql-yoga/refs/heads/main/website/src/app/favicon.ico">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b0d11;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
    }
    .hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 900px;
    }
    .title-group {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.25rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    .logo-svg {
      width: 76px;
      height: 80px;
    }
    h1 {
      font-size: 3.75rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #ffffff;
    }
    .version {
      font-size: 0.875rem;
      color: #94a3b8;
      font-weight: 500;
      align-self: flex-start;
      margin-top: 1rem;
    }
    h2 {
      font-size: 1.35rem;
      font-weight: 400;
      color: #94a3b8;
      margin-bottom: 2.5rem;
    }
    .buttons {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2.5rem;
      flex-wrap: wrap;
    }
    .buttons a {
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 1.05rem;
      transition: color 0.2s ease, opacity 0.2s ease;
    }
    .buttons a:hover {
      color: #c084fc;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="title-group">
      <svg class="logo-svg" viewBox="0 0 76 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M38 0C39.6 0 41.1 0.4 42.4 1.2L72.2 18.4C74.6 19.8 76 22.3 76 25.1V59.6C76 62.4 74.6 64.9 72.2 66.3L42.4 83.5C41.1 84.3 39.6 84.7 38 84.7C36.4 84.7 34.9 84.3 33.6 83.5L3.8 66.3C1.4 64.9 0 62.4 0 59.6V25.1C0 22.3 1.4 19.8 3.8 18.4L33.6 1.2C34.9 0.4 36.4 0 38 0Z" fill="url(#yoga-grad)"/>
        <path d="M38 18C27.5 18 19 26.5 19 37C19 47.5 27.5 56 38 56C48.5 56 57 47.5 57 37C57 26.5 48.5 18 38 18ZM38 48C31.9 48 27 43.1 27 37C27 30.9 31.9 26 38 26C44.1 26 49 30.9 49 37C49 43.1 44.1 48 38 48Z" fill="#0B0D11"/>
        <circle cx="38" cy="37" r="5" fill="#E2E8F0"/>
        <defs>
          <linearGradient id="yoga-grad" x1="0" y1="0" x2="76" y2="84.7" gradientUnits="userSpaceOnUse">
            <stop stop-color="#F43F5E"/>
            <stop offset="0.5" stop-color="#A855F7"/>
            <stop offset="1" stop-color="#3B82F6"/>
          </linearGradient>
        </defs>
      </svg>
      <h1>GraphQL Yoga</h1>
      <span class="version">Version: 5.22.0</span>
    </div>
    <h2>The batteries-included cross-platform GraphQL Server.</h2>
    <div class="buttons">
      <a href="https://www.the-guild.dev/graphql/yoga-server/docs" target="_blank">Read the Docs</a>
      <a href="https://www.the-guild.dev/graphql/yoga-server/tutorial/basic" target="_blank">Start the Tutorial</a>
      <a href="/graphql">Visit GraphiQL</a>
    </div>
  </div>
</body>
</html>`;

export default async function handler(req: any, res: any) {
  try {
    const rawUrl = req.url || "/";
    const acceptHeader = req.headers?.accept || "";

    // Serve exact Home Page HTML when visiting root domain in browser
    if ((rawUrl === "/" || rawUrl === "" || rawUrl === "/api" || rawUrl === "/api/index") && req.method === "GET" && acceptHeader.includes("text/html")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(HOME_PAGE_HTML);
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
