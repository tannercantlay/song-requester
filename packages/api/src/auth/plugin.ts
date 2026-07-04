import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import csrfProtection from "@fastify/csrf-protection";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(cookie, { secret: env.COOKIE_SECRET });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: "token", signed: false },
  });

  await app.register(csrfProtection, {
    cookieOpts: { path: "/", signed: true, httpOnly: false, sameSite: "lax" },
  });
}

export interface JwtPayload {
  adminId: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
