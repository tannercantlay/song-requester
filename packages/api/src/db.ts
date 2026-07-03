import { Kysely, PostgresDialect, type Generated, type ColumnType } from "kysely";
import { Pool } from "pg";
import { env } from "./env.js";

export interface AdminTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  spotify_refresh_token_enc: string | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface SongTable {
  id: Generated<string>;
  title: string;
  artist: string;
  album: string | null;
  album_art_url: string | null;
  duration_ms: number | null;
  spotify_uri: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface EventTable {
  id: Generated<string>;
  name: string;
  public_token: string;
  status: Generated<"active" | "ended">;
  requests_paused: Generated<boolean>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
  ended_at: Date | null;
}

export interface RequestTable {
  id: Generated<string>;
  event_id: string;
  song_id: string;
  status: Generated<"pending" | "playing" | "played" | "dismissed">;
  vote_count: Generated<number>;
  queue_position: number | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
  updated_at: Generated<ColumnType<Date, string | undefined, string | undefined>>;
  played_at: Date | null;
}

export interface RequestVoteTable {
  id: Generated<string>;
  request_id: string;
  requester_token: string;
  requester_name: string | null;
  note: string | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface BlockedGuestTable {
  id: Generated<string>;
  event_id: string;
  requester_token: string;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface Database {
  admin: AdminTable;
  song: SongTable;
  event: EventTable;
  request: RequestTable;
  request_vote: RequestVoteTable;
  blocked_guest: BlockedGuestTable;
}

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: env.DATABASE_URL }),
  }),
});
