import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth/requireAdmin.js";
import { HttpError, patchRequestStatus } from "../services/requests.js";
import { broadcast } from "../sse.js";

const patchRequestSchema = z.object({
  status: z.enum(["playing", "played", "dismissed"]),
});

export async function requestsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  app.patch("/api/requests/:id", { preHandler: app.csrfProtection }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = patchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }

    try {
      const { request: updated, eventId } = await patchRequestStatus(id, parsed.data.status);
      broadcast(eventId, "request.updated", {
        requestId: updated.id,
        status: updated.status,
        voteCount: updated.vote_count,
      });
      return {
        id: updated.id,
        status: updated.status,
        voteCount: updated.vote_count,
        playedAt: updated.played_at,
      };
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });
}
