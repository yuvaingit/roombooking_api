import { yoga } from "../src/server";

export default async function handler(req: any, res: any) {
  if (!process.env.DATABASE_URL) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "DATABASE_URL environment variable is missing.",
        message:
          "Please configure your hosted PostgreSQL DATABASE_URL in Vercel Project Settings -> Environment Variables.",
      })
    );
    return;
  }

  return yoga(req, res);
}
