import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { requireAdmin } from "../auth/requireAdmin.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const isProd = process.env.NODE_ENV === "production";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth/csrf", async (_request, reply) => {
    return { csrfToken: reply.generateCsrf() };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    const { email, password } = parsed.data;

    const admin = await db.selectFrom("admin").selectAll().where("email", "=", email).executeTakeFirst();
    if (!admin) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const valid = await argon2.verify(admin.password_hash, password);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const token = app.jwt.sign({ adminId: admin.id }, { expiresIn: "7d" });
    reply.setCookie("token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return { id: admin.id, email: admin.email };
  });

  // Deliberately NOT behind requireAdmin. Logging out is idempotent — it just
  // clears a cookie — and gating it meant that an already-expired session got
  // a 401, which the client surfaced as the Log out button doing nothing at
  // all. That is the exact moment you most need it to work.
  app.post("/api/auth/logout", async (_request, reply) => {
    // Attributes must match the ones used at login (see setCookie above).
    // Deletion is keyed on name/domain/path per RFC 6265, but mismatched
    // Secure/SameSite is a well-known source of browser-specific misses.
    reply.clearCookie("token", {
      path: "/",
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
    });
    return reply.code(204).send();
  });

  app.get("/api/me", { preHandler: requireAdmin }, async (request, reply) => {
    const admin = await db
      .selectFrom("admin")
      .select(["id", "email", "spotify_refresh_token_enc"])
      .where("id", "=", request.user.adminId)
      .executeTakeFirst();
    if (!admin) {
      return reply.code(401).send({ error: "Not authenticated" });
    }
    return {
      id: admin.id,
      email: admin.email,
      spotifyConnected: admin.spotify_refresh_token_enc !== null,
    };
  });
}
