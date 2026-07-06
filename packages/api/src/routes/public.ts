import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getActiveEventByToken } from "../services/events.js";
import { createOrUpvote, getGuestSongs, HttpError } from "../services/requests.js";
import { sanitizeGuestText, containsProfanity } from "../lib/moderation.js";
import { listGenres } from "../services/songs.js";
import { db } from "../db.js";
import { broadcast } from "../sse.js";

const requestBodySchema = z.object({
  songId: z.string().uuid(),
  requesterToken: z.string().min(8).max(128),
  name: z.string().max(24).optional(),
  note: z.string().max(80).optional(),
});

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/e/:token", async (request) => {
    const { token } = request.params as { token: string };
    const event = await getActiveEventByToken(token);
    return { id: event.id, name: event.name, requestsPaused: event.requests_paused };
  });

  app.get("/api/e/:token/songs", async (request) => {
    const { token } = request.params as { token: string };
    const { search, genre } = request.query as { search?: string; genre?: string };
    const event = await getActiveEventByToken(token);
    const [songs, genres] = await Promise.all([getGuestSongs(event.id, search, genre), listGenres()]);
    return { requestsPaused: event.requests_paused, songs, genres };
  });

  app.get("/api/e/:token/now-playing", async (request) => {
    const { token } = request.params as { token: string };
    const event = await getActiveEventByToken(token);
    const playing = await db
      .selectFrom("request")
      .innerJoin("song", "song.id", "request.song_id")
      .select(["request.id as id", "song.title as title", "song.artist as artist"])
      .where("request.event_id", "=", event.id)
      .where("request.status", "=", "playing")
      .executeTakeFirst();
    return { nowPlaying: playing ?? null };
  });

  const requestRateLimit = app.rateLimit({
    max: 1,
    timeWindow: 3_000,
    keyGenerator: (request) => {
      const body = request.body as { requesterToken?: string } | undefined;
      return `${request.ip}:${body?.requesterToken ?? ""}`;
    },
    errorResponseBuilder: () => ({ error: "You're requesting too fast — wait a moment and try again" }),
  });

  app.post("/api/e/:token/requests", { preHandler: requestRateLimit }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const parsed = requestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    const { songId, requesterToken } = parsed.data;
    let { name, note } = parsed.data;

    if (name) {
      name = sanitizeGuestText(name);
      if (containsProfanity(name)) {
        return reply.code(400).send({ error: "Name contains disallowed language" });
      }
    }
    if (note) {
      note = sanitizeGuestText(note);
      if (containsProfanity(note)) {
        return reply.code(400).send({ error: "Note contains disallowed language" });
      }
    }

    const event = await getActiveEventByToken(token);
    if (event.requests_paused) {
      return reply.code(423).send({ error: "Requests are paused" });
    }

    try {
      const result = await createOrUpvote({
        eventId: event.id,
        songId,
        requesterToken,
        name,
        note,
      });

      broadcast(event.id, result.created ? "request.created" : "request.updated", {
        requestId: result.requestId,
        status: result.status,
        voteCount: result.voteCount,
      });

      return reply.code(result.created ? 201 : 200).send({
        id: result.requestId,
        status: result.status,
        voteCount: result.voteCount,
        queuePosition: result.queuePosition,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });
}
