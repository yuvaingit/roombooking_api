import { createYoga, createSchema } from "graphql-yoga";
import { createServer } from "node:http";
import { resolvers } from "./resolvers";
import { typeDefs } from "./schema";

export const schema = createSchema({
  typeDefs,
  resolvers,
});

export const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql",
  landingPage: true,
  plugins: [
    {
      async onResponse({ response, fetchAPI, setResponse }) {
        if (response.headers.get("content-type")?.includes("text/html")) {
          let html = await response.text();
          const targetIdx = html.indexOf("Not the page you are looking for");
          if (targetIdx !== -1) {
            const secStart = html.lastIndexOf("<section", targetIdx);
            if (secStart !== -1) {
              html = html.substring(0, secStart) + "</main></body></html>";
            }
          }
          setResponse(
            new fetchAPI.Response(html, {
              status: response.status,
              headers: response.headers,
            })
          );
        }
      },
    },
  ],
});

const server = createServer(yoga);

const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🚀 Room Booking GraphQL API running at http://localhost:${PORT}/graphql`);
  });
}

export default server;
