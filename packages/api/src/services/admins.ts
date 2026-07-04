import argon2 from "argon2";
import { db } from "../db.js";
import { HttpError } from "./requests.js";

export async function listAdmins() {
  const admins = await db
    .selectFrom("admin")
    .select(["id", "email", "created_at"])
    .orderBy("created_at", "asc")
    .execute();
  return admins;
}

export async function createAdmin(email: string, password: string) {
  const existing = await db.selectFrom("admin").select("id").where("email", "=", email).executeTakeFirst();
  if (existing) {
    throw new HttpError(409, "An admin with that email already exists");
  }

  const passwordHash = await argon2.hash(password);
  return db
    .insertInto("admin")
    .values({ email, password_hash: passwordHash })
    .returning(["id", "email", "created_at"])
    .executeTakeFirstOrThrow();
}

export async function deleteAdmin(id: string, currentAdminId: string): Promise<void> {
  if (id === currentAdminId) {
    throw new HttpError(400, "You can't remove your own account while logged in as it");
  }

  const admin = await db.selectFrom("admin").select("id").where("id", "=", id).executeTakeFirst();
  if (!admin) {
    throw new HttpError(404, "Admin not found");
  }

  const { count } = await db
    .selectFrom("admin")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();
  if (Number(count) <= 1) {
    throw new HttpError(400, "Can't remove the last remaining admin");
  }

  await db.deleteFrom("admin").where("id", "=", id).execute();
}
