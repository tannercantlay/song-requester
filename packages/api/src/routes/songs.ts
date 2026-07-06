import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth/requireAdmin.js";
import {
  bulkImportSongs,
  createSong,
  hideSong,
  listGenres,
  listSongsAdmin,
  updateSong,
} from "../services/songs.js";
import { parseSpreadsheet } from "../lib/spreadsheet.js";
import { HttpError } from "../services/requests.js";

const createSongSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  album: z.string().max(200).optional(),
  albumArtUrl: z.string().url().optional(),
  durationMs: z.number().int().positive().optional(),
  genre: z.string().max(60).optional(),
});

const updateSongSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  artist: z.string().min(1).max(200).optional(),
  album: z.string().max(200).nullable().optional(),
  albumArtUrl: z.string().url().nullable().optional(),
  durationMs: z.number().int().positive().nullable().optional(),
  genre: z.string().max(60).nullable().optional(),
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
      genre: s.genre,
      spotifyUri: s.spotify_uri,
      isActive: s.is_active,
    }));
  });

  app.get("/api/songs/genres", async () => listGenres());

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
      genre: song.genre,
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
        genre: song.genre,
        isActive: song.is_active,
      };
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post("/api/songs/import", { preHandler: app.csrfProtection }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "No file uploaded" });
    }
    if (!/\.(csv|xlsx|xls)$/i.test(file.filename)) {
      return reply.code(400).send({ error: "Only .csv, .xlsx, or .xls files are supported" });
    }

    const buffer = await file.toBuffer();
    let parsed: ReturnType<typeof parseSpreadsheet>;
    try {
      parsed = parseSpreadsheet(buffer);
    } catch {
      return reply.code(400).send({ error: "Couldn't read that file — is it a valid CSV/Excel file?" });
    }

    const { imported, skipped } = await bulkImportSongs(parsed.rows);
    return { imported, skipped, errors: parsed.errors };
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
