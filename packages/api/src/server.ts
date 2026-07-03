import Fastify from "fastify";
import { env } from "./env.js";
import { HttpError } from "./services/requests.js";
import { publicRoutes } from "./routes/public.js";
import { eventsRoutes } from "./routes/events.js";
import { requestsRoutes } from "./routes/requests.js";

const app = Fastify({ logger: true });

app.setErrorHandler((err, _request, reply) => {
  if (err instanceof HttpError) {
    return reply.code(err.status).send({ error: err.message });
  }
  app.log.error(err);
  return reply.code(500).send({ error: "Internal server error" });
});

app.get("/health", async () => ({ ok: true }));

await app.register(publicRoutes);
await app.register(eventsRoutes);
await app.register(requestsRoutes);

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
