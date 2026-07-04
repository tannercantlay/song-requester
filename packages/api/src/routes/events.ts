import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth/requireAdmin.js";
import {
  blockGuest,
  createEvent,
  getEventById,
  listActiveEvents,
  patchEvent,
  reorderQueue,
} from "../services/events.js";
import { getQueue, HttpError } from "../services/requests.js";
import { broadcast, subscribe } from "../sse.js";

const createEventSchema = z.object({ name: z.string().min(1).max(120) });
const patchEventSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(["active", "ended"]).optional(),
  requestsPaused: z.boolean().optional(),
});
const reorderSchema = z.object({ order: z.array(z.string().uuid()).min(1) });
const blockSchema = z.object({ requesterToken: z.string().min(1) });

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/events", async () => {
    const events = await listActiveEvents();
    return events.map((e) => ({
      id: e.id,
      name: e.name,
      publicToken: e.public_token,
      status: e.status,
      requestsPaused: e.requests_paused,
      createdAt: e.created_at,
    }));
  });

  app.post("/api/events", { preHandler: app.csrfProtection }, async (request, reply) => {
    const parsed = createEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    const event = await createEvent(parsed.data.name);
    return reply.code(201).send({
      id: event.id,
      name: event.name,
      publicToken: event.public_token,
      status: event.status,
      requestsPaused: event.requests_paused,
    });
  });

  app.patch("/api/events/:id", { preHandler: app.csrfProtection }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = patchEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    try {
      const event = await patchEvent(id, parsed.data);
      broadcast(id, "event.updated", {
        name: event.name,
        status: event.status,
        requestsPaused: event.requests_paused,
      });
      return {
        id: event.id,
        name: event.name,
        status: event.status,
        requestsPaused: event.requests_paused,
      };
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get("/api/events/:id/requests", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await getEventById(id);
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
    return getQueue(id);
  });

  app.post("/api/events/:id/reorder", { preHandler: app.csrfProtection }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = reorderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    try {
      await reorderQueue(id, parsed.data.order);
      broadcast(id, "queue.reordered", { order: parsed.data.order });
      return getQueue(id);
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post("/api/events/:id/block", { preHandler: app.csrfProtection }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = blockSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    try {
      await blockGuest(id, parsed.data.requesterToken);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get("/api/events/:id/stream", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await getEventById(id);
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
    subscribe(id, reply);
  });
}
