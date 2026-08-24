import { createYoga, createSchema } from "graphql-yoga";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvers } from "./resolvers";

const typeDefs = readFileSync(
  join(__dirname, "schema.graphql"),
  "utf-8"
);

export const schema = createSchema({
  typeDefs,
  resolvers,
});

export const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql",
  landingPage: true,
});

const server = createServer(yoga);

const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`🚀 Room Booking GraphQL API running at http://localhost:${PORT}/graphql`);
  });
}

export default server;
