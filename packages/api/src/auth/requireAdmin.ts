import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "Not authenticated" });
  }
}
