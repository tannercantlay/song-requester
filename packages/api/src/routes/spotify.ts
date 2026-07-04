import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth/requireAdmin.js";
import { db } from "../db.js";
import { env } from "../env.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import { HttpError } from "../services/requests.js";
import { upsertFromSpotify } from "../services/songs.js";
import {
  exchangeCode,
  getAccessTokenFromRefreshToken,
  getAuthorizeUrl,
  getPlaylistTracks,
  listPlaylists,
} from "../services/spotify.js";

const importSchema = z.object({ playlistId: z.string().min(1) });

async function getAccessTokenForAdmin(adminId: string): Promise<string> {
  const admin = await db
    .selectFrom("admin")
    .select("spotify_refresh_token_enc")
    .where("id", "=", adminId)
    .executeTakeFirst();

  if (!admin?.spotify_refresh_token_enc) {
    throw new HttpError(409, "Spotify isn't connected yet");
  }

  const refreshToken = decrypt(admin.spotify_refresh_token_enc);
  return getAccessTokenFromRefreshToken(refreshToken);
}

export async function spotifyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/spotify/connect", async (request, reply) => {
    const state = randomBytes(16).toString("hex");
    reply.setCookie("spotify_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return reply.redirect(getAuthorizeUrl(state));
  });

  app.get("/api/spotify/callback", async (request, reply) => {
    const { code, state, error } = request.query as { code?: string; state?: string; error?: string };
    const expectedState = request.cookies.spotify_oauth_state;
    reply.clearCookie("spotify_oauth_state", { path: "/" });

    if (error) {
      return reply.code(400).send({ error: `Spotify authorization failed: ${error}` });
    }
    if (!code || !state || state !== expectedState) {
      return reply.code(400).send({ error: "Invalid or expired Spotify authorization state" });
    }

    const { refreshToken } = await exchangeCode(code);
    await db
      .updateTable("admin")
      .set({ spotify_refresh_token_enc: encrypt(refreshToken) })
      .where("id", "=", request.user.adminId)
      .execute();

    return reply.redirect(`${env.WEB_ORIGIN}/admin/catalog?spotify=connected`);
  });

  app.get("/api/spotify/playlists", async (request, reply) => {
    try {
      const accessToken = await getAccessTokenForAdmin(request.user.adminId);
      return await listPlaylists(accessToken);
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post("/api/spotify/import", { preHandler: app.csrfProtection }, async (request, reply) => {
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    try {
      const accessToken = await getAccessTokenForAdmin(request.user.adminId);
      const tracks = await getPlaylistTracks(accessToken, parsed.data.playlistId);
      const count = await upsertFromSpotify(tracks);
      return { imported: count };
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });
}
