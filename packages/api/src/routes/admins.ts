import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth/requireAdmin.js";
import { createAdmin, deleteAdmin, listAdmins } from "../services/admins.js";
import { HttpError } from "../services/requests.js";

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function adminsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  app.get("/api/admins", async () => {
    const admins = await listAdmins();
    return admins.map((a) => ({ id: a.id, email: a.email, createdAt: a.created_at }));
  });

  app.post("/api/admins", { preHandler: app.csrfProtection }, async (request, reply) => {
    const parsed = createAdminSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    try {
      const admin = await createAdmin(parsed.data.email, parsed.data.password);
      return reply.code(201).send({ id: admin.id, email: admin.email, createdAt: admin.created_at });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });

  app.delete("/api/admins/:id", { preHandler: app.csrfProtection }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteAdmin(id, request.user.adminId);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.status).send({ error: err.message });
      }
      throw err;
    }
  });
}
