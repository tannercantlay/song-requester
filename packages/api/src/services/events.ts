import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { HttpError } from "./requests.js";

export async function getActiveEventByToken(token: string) {
  const event = await db
    .selectFrom("event")
    .selectAll()
    .where("public_token", "=", token)
    .executeTakeFirst();

  if (!event) throw new HttpError(404, "Event not found");
  if (event.status !== "active") throw new HttpError(410, "This event has ended");

  return event;
}

export async function getEventById(id: string) {
  const event = await db.selectFrom("event").selectAll().where("id", "=", id).executeTakeFirst();
  if (!event) throw new HttpError(404, "Event not found");
  return event;
}

export async function listActiveEvents() {
  return db
    .selectFrom("event")
    .selectAll()
    .where("status", "=", "active")
    .orderBy("created_at", "desc")
    .execute();
}

export async function createEvent(name: string) {
  const publicToken = randomBytes(16).toString("base64url");
  return db
    .insertInto("event")
    .values({ name, public_token: publicToken })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function patchEvent(
  id: string,
  patch: { status?: "active" | "ended"; requestsPaused?: boolean },
) {
  await getEventById(id);
  const updated = await db
    .updateTable("event")
    .set({
      status: patch.status,
      requests_paused: patch.requestsPaused,
      ended_at: patch.status === "ended" ? new Date() : undefined,
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return updated;
}
