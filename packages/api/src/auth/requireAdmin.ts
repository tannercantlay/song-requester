import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";

// Phase 1: dev-only bypass so admin routes are testable before Phase 3 wires
// real JWT auth. Remove the DEV_AUTH_BYPASS branch when Phase 3 lands.
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (env.DEV_AUTH_BYPASS) {
    return;
  }
  reply.code(401).send({ error: "Not authenticated" });
}
