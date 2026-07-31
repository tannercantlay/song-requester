import { sql } from "kysely";
import { db } from "../db.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type GuestSongStatus = "none" | "pending" | "playing" | "played";

export interface GuestSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtUrl: string | null;
  durationMs: number | null;
  genre: string | null;
  status: GuestSongStatus;
  voteCount: number;
}

export type GuestSongSort = "title" | "artist";

export async function getGuestSongs(
  eventId: string,
  search?: string,
  genre?: string,
  sort: GuestSongSort = "title",
): Promise<GuestSong[]> {
  let query = db
    .selectFrom("song")
    .leftJoin("request", (join) =>
      join.onRef("request.song_id", "=", "song.id").on("request.event_id", "=", eventId),
    )
    .where("song.is_active", "=", true)
    .select([
      "song.id as id",
      "song.title as title",
      "song.artist as artist",
      "song.album as album",
      "song.album_art_url as albumArtUrl",
      "song.duration_ms as durationMs",
      "song.genre as genre",
      sql<GuestSongStatus>`coalesce(request.status, 'none')`.as("status"),
      sql<number>`coalesce(request.vote_count, 0)`.as("voteCount"),
    ])
    // Secondary sort matters as much as the primary: grouping by artist is
    // useless if that artist's songs then come back in arbitrary order.
    // lower() so "ABBA" and "Abba" don't end up in separate blocks — Postgres
    // collations vary on case, and the catalog is hand-entered.
    .orderBy(
      sort === "artist" ? sql`lower(song.artist)` : sql`lower(song.title)`,
      "asc",
    )
    .orderBy(
      sort === "artist" ? sql`lower(song.title)` : sql`lower(song.artist)`,
      "asc",
    );

  if (search) {
    query = query.where((eb) =>
      eb.or([eb("song.title", "ilike", `%${search}%`), eb("song.artist", "ilike", `%${search}%`)]),
    );
  }

  if (genre) {
    query = query.where("song.genre", "=", genre);
  }

  return query.execute();
}

interface CreateOrUpvoteInput {
  eventId: string;
  songId: string;
  requesterToken: string;
  name?: string;
  note?: string;
}

interface CreateOrUpvoteResult {
  created: boolean;
  requestId: string;
  status: string;
  voteCount: number;
  queuePosition: number | null;
}

export async function createOrUpvote(input: CreateOrUpvoteInput): Promise<CreateOrUpvoteResult> {
  const { eventId, songId, requesterToken, name, note } = input;

  const isBlocked = await db
    .selectFrom("blocked_guest")
    .select("id")
    .where("event_id", "=", eventId)
    .where("requester_token", "=", requesterToken)
    .executeTakeFirst();
  if (isBlocked) {
    throw new HttpError(403, "You've been blocked from requesting songs at this event");
  }

  const song = await db
    .selectFrom("song")
    .select("id")
    .where("id", "=", songId)
    .where("is_active", "=", true)
    .executeTakeFirst();
  if (!song) {
    throw new HttpError(404, "Song not found");
  }

  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("request")
      .selectAll()
      .where("event_id", "=", eventId)
      .where("song_id", "=", songId)
      .executeTakeFirst();

    if (!existing) {
      const created = await trx
        .insertInto("request")
        .values({ event_id: eventId, song_id: songId, status: "pending", vote_count: 1 })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("request_vote")
        .values({
          request_id: created.id,
          requester_token: requesterToken,
          requester_name: name ?? null,
          note: note ?? null,
        })
        .execute();

      return {
        created: true,
        requestId: created.id,
        status: created.status,
        voteCount: created.vote_count,
        queuePosition: created.queue_position,
      };
    }

    if (existing.status === "played") {
      throw new HttpError(409, "This song has already been played");
    }

    const voteInsert = await trx
      .insertInto("request_vote")
      .values({
        request_id: existing.id,
        requester_token: requesterToken,
        requester_name: name ?? null,
        note: note ?? null,
      })
      .onConflict((oc) => oc.columns(["request_id", "requester_token"]).doNothing())
      .executeTakeFirst();

    const alreadyVoted = voteInsert.numInsertedOrUpdatedRows === 0n;

    if (alreadyVoted) {
      return {
        created: false,
        requestId: existing.id,
        status: existing.status,
        voteCount: existing.vote_count,
        queuePosition: existing.queue_position,
      };
    }

    const nextStatus = existing.status === "dismissed" ? "pending" : existing.status;
    const updated = await trx
      .updateTable("request")
      .set({ vote_count: existing.vote_count + 1, status: nextStatus })
      .where("id", "=", existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      created: false,
      requestId: updated.id,
      status: updated.status,
      voteCount: updated.vote_count,
      queuePosition: updated.queue_position,
    };
  });
}

export interface QueueNote {
  requesterToken: string;
  name: string | null;
  note: string | null;
  createdAt: Date;
}

export interface QueueRequest {
  id: string;
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtUrl: string | null;
  durationMs: number | null;
  status: string;
  voteCount: number;
  queuePosition: number | null;
  createdAt: Date;
  updatedAt: Date;
  playedAt: Date | null;
  notes: QueueNote[];
  tokens: string[];
}

export async function getQueue(eventId: string): Promise<QueueRequest[]> {
  const requests = await db
    .selectFrom("request")
    .innerJoin("song", "song.id", "request.song_id")
    .where("request.event_id", "=", eventId)
    .select([
      "request.id as id",
      "request.song_id as songId",
      "song.title as title",
      "song.artist as artist",
      "song.album as album",
      "song.album_art_url as albumArtUrl",
      "song.duration_ms as durationMs",
      "request.status as status",
      "request.vote_count as voteCount",
      "request.queue_position as queuePosition",
      "request.created_at as createdAt",
      "request.updated_at as updatedAt",
      "request.played_at as playedAt",
    ])
    .orderBy(sql`(request.status = 'playing')`, "desc")
    .orderBy("request.queue_position", "asc")
    .orderBy("request.vote_count", "desc")
    .orderBy("request.created_at", "asc")
    .execute();

  if (requests.length === 0) return [];

  const votes = await db
    .selectFrom("request_vote")
    .innerJoin("request", "request.id", "request_vote.request_id")
    .where("request.event_id", "=", eventId)
    .select([
      "request_vote.request_id as requestId",
      "request_vote.requester_token as requesterToken",
      "request_vote.requester_name as name",
      "request_vote.note as note",
      "request_vote.created_at as createdAt",
    ])
    .execute();

  const votesByRequest = new Map<string, QueueNote[]>();
  const tokensByRequest = new Map<string, string[]>();
  for (const vote of votes) {
    const notes = votesByRequest.get(vote.requestId) ?? [];
    if (vote.name || vote.note) {
      notes.push({
        requesterToken: vote.requesterToken,
        name: vote.name,
        note: vote.note,
        createdAt: vote.createdAt,
      });
    }
    votesByRequest.set(vote.requestId, notes);

    const tokens = tokensByRequest.get(vote.requestId) ?? [];
    tokens.push(vote.requesterToken);
    tokensByRequest.set(vote.requestId, tokens);
  }

  return requests.map((r) => ({
    ...r,
    notes: votesByRequest.get(r.id) ?? [],
    tokens: tokensByRequest.get(r.id) ?? [],
  }));
}

export async function patchRequestStatus(
  requestId: string,
  status: "playing" | "played" | "dismissed",
) {
  const request = await db
    .selectFrom("request")
    .select(["id", "event_id"])
    .where("id", "=", requestId)
    .executeTakeFirst();
  if (!request) {
    throw new HttpError(404, "Request not found");
  }

  const updated = await db
    .updateTable("request")
    .set({
      status,
      played_at: status === "played" ? new Date() : undefined,
      queue_position: status === "played" ? null : undefined,
    })
    .where("id", "=", requestId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return { request: updated, eventId: request.event_id };
}
