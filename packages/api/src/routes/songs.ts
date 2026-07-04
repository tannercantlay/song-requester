import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth/requireAdmin.js";
import { createSong, hideSong, listSongsAdmin, updateSong } from "../services/songs.js";
import { HttpError } from "../services/requests.js";

const createSongSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  album: z.string().max(200).optional(),
  albumArtUrl: z.string().url().optional(),
  durationMs: z.number().int().positive().optional(),
});

const updateSongSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  artist: z.string().min(1).max(200).optional(),
  album: z.string().max(200).nullable().optional(),
  albumArtUrl: z.string().url().nullable().optional(),
  durationMs: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function songsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/songs", async (request) => {
    const { search } = request.query as { search?: string };
    const songs = await listSongsAdmin(search);
    return songs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      albumArtUrl: s.album_art_url,
      durationMs: s.duration_ms,
      spotifyUri: s.spotify_uri,
      isActive: s.is_active,
    }));
  });

  app.post("/api/songs", { preHandler: app.csrfProtection }, async (request, reply) => {
    const parsed = createSongSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    const song = await createSong(parsed.data);
    return reply.code(201).send({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      albumArtUrl: song.album_art_url,
      durationMs: song.duration_ms,
      isActive: song.is_active,
    });
  });

  app.patch("/api/songs/:id", { preHandler: app.csrfProtection }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateSongSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    try {
      const song = await updateSong(id, parsed.data);
      return {
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        albumArtUrl: song.album_art_url,
        durationMs: song.duration_ms,
        isActive: song.is_active,
      };
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  app.delete("/api/songs/:id", { preHandler: app.csrfProtection }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await hideSong(id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });
}
