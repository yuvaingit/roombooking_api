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
  landingPage: true,
});

const server = createServer(yoga);

const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🚀 Room Booking GraphQL API running at http://localhost:${PORT}/graphql`);
  });
}

export default server;
