import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { env } from "./env.js";
import { registerAuth } from "./auth/plugin.js";
import { HttpError } from "./services/requests.js";
import { publicRoutes } from "./routes/public.js";
import { eventsRoutes } from "./routes/events.js";
import { requestsRoutes } from "./routes/requests.js";
import { authRoutes } from "./routes/auth.js";
import { songsRoutes } from "./routes/songs.js";
import { spotifyRoutes } from "./routes/spotify.js";
import { adminsRoutes } from "./routes/admins.js";

const webDist = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : fileURLToPath(new URL("../../web/dist/", import.meta.url));

const app = Fastify({ logger: true });

app.setErrorHandler((err, _request, reply) => {
  if (err instanceof HttpError) {
    return reply.code(err.status).send({ error: err.message });
  }
  // Fastify/plugin errors (e.g. @fastify/csrf-protection, @fastify/jwt) carry
  // their own statusCode — respect it instead of collapsing everything to 500.
  if ("statusCode" in err && typeof err.statusCode === "number" && err.statusCode < 500) {
    return reply.code(err.statusCode).send({ error: err.message });
  }
  app.log.error(err);
  return reply.code(500).send({ error: "Internal server error" });
});

app.get("/health", async () => ({ ok: true }));

// @fastify/rate-limit@7's .d.ts doesn't resolve cleanly under NodeNext module
// resolution (default import types as the whole namespace); the runtime
// export is a plain Fastify plugin function, so this cast is safe.
await app.register(rateLimit as unknown as Parameters<typeof app.register>[0], { global: false });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await registerAuth(app);

await app.register(publicRoutes);
await app.register(eventsRoutes);
await app.register(requestsRoutes);
await app.register(authRoutes);
await app.register(songsRoutes);
await app.register(spotifyRoutes);
await app.register(adminsRoutes);

await app.register(fastifyStatic, {
  root: webDist,
  prefix: "/",
  index: ["index.html"],
  wildcard: false,
});

app.setNotFoundHandler((request, reply) => {
  if (request.method !== "GET" || request.url.startsWith("/api/")) {
    return reply.code(404).send({ error: "Not found" });
  }
  return reply.sendFile("index.html");
});

app
  .listen({ port: env.PORT ?? env.API_PORT, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
