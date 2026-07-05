import { db } from "../db.js";
import { HttpError } from "./requests.js";
import type { SpotifyTrack } from "./spotify.js";
import type { ParsedRow } from "../lib/spreadsheet.js";

export async function listSongsAdmin(search?: string) {
  let query = db.selectFrom("song").selectAll().orderBy("title", "asc");
  if (search) {
    query = query.where((eb) =>
      eb.or([eb("title", "ilike", `%${search}%`), eb("artist", "ilike", `%${search}%`)]),
    );
  }
  return query.execute();
}

export interface CreateSongInput {
  title: string;
  artist: string;
  album?: string;
  albumArtUrl?: string;
  durationMs?: number;
}

export async function createSong(input: CreateSongInput) {
  return db
    .insertInto("song")
    .values({
      title: input.title,
      artist: input.artist,
      album: input.album ?? null,
      album_art_url: input.albumArtUrl ?? null,
      duration_ms: input.durationMs ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export interface UpdateSongInput {
  title?: string;
  artist?: string;
  album?: string | null;
  albumArtUrl?: string | null;
  durationMs?: number | null;
  isActive?: boolean;
}

export async function updateSong(id: string, patch: UpdateSongInput) {
  const existing = await db.selectFrom("song").select("id").where("id", "=", id).executeTakeFirst();
  if (!existing) throw new HttpError(404, "Song not found");

  return db
    .updateTable("song")
    .set({
      title: patch.title,
      artist: patch.artist,
      album: patch.album,
      album_art_url: patch.albumArtUrl,
      duration_ms: patch.durationMs,
      is_active: patch.isActive,
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function hideSong(id: string) {
  return updateSong(id, { isActive: false });
}

export async function bulkImportSongs(rows: ParsedRow[]): Promise<{ imported: number; skipped: number }> {
  const existing = await db.selectFrom("song").select(["title", "artist"]).execute();
  const seen = new Set(existing.map((s) => `${s.title.toLowerCase()}::${s.artist.toLowerCase()}`));

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const key = `${row.title.toLowerCase()}::${row.artist.toLowerCase()}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    await db
      .insertInto("song")
      .values({ title: row.title, artist: row.artist, album: row.album ?? null })
      .execute();
    imported++;
  }

  return { imported, skipped };
}

export async function upsertFromSpotify(tracks: SpotifyTrack[]): Promise<number> {
  let count = 0;
  for (const track of tracks) {
    await db
      .insertInto("song")
      .values({
        title: track.title,
        artist: track.artist,
        album: track.album,
        album_art_url: track.albumArtUrl,
        duration_ms: track.durationMs,
        spotify_uri: track.spotifyUri,
      })
      .onConflict((oc) =>
        oc.column("spotify_uri").doUpdateSet({
          title: (eb) => eb.ref("excluded.title"),
          artist: (eb) => eb.ref("excluded.artist"),
          album: (eb) => eb.ref("excluded.album"),
          album_art_url: (eb) => eb.ref("excluded.album_art_url"),
          duration_ms: (eb) => eb.ref("excluded.duration_ms"),
        }),
      )
      .execute();
    count++;
  }
  return count;
}
