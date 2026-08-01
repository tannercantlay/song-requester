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
  patch: { name?: string; status?: "active" | "ended"; requestsPaused?: boolean },
) {
  await getEventById(id);
  const updated = await db
    .updateTable("event")
    .set({
      name: patch.name,
      status: patch.status,
      requests_paused: patch.requestsPaused,
      ended_at: patch.status === "ended" ? new Date() : undefined,
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return updated;
}

/**
 * Removes every request for an event, returning it to a fresh queue while
 * keeping the event itself — same id, same public token, so printed QR codes
 * and table cards stay valid for the next night.
 *
 * request_vote cascades from request (0001_initial_schema), so the votes go
 * with them. blocked_guest hangs off event rather than request and is left
 * alone: someone barred from requesting should stay barred after a tidy-up.
 */
export async function clearQueue(eventId: string): Promise<number> {
  await getEventById(eventId);

  const result = await db.deleteFrom("request").where("event_id", "=", eventId).executeTakeFirst();

  return Number(result.numDeletedRows ?? 0);
}

export async function reorderQueue(eventId: string, order: string[]): Promise<void> {
  await getEventById(eventId);

  const existing = await db
    .selectFrom("request")
    .select("id")
    .where("event_id", "=", eventId)
    .where("id", "in", order)
    .execute();

  if (existing.length !== order.length) {
    throw new HttpError(400, "One or more requests don't belong to this event");
  }

  await db.transaction().execute(async (trx) => {
    for (const [index, requestId] of order.entries()) {
      await trx
        .updateTable("request")
        .set({ queue_position: index + 1 })
        .where("id", "=", requestId)
        .where("event_id", "=", eventId)
        .execute();
    }
  });
}

export async function blockGuest(eventId: string, requesterToken: string): Promise<void> {
  await getEventById(eventId);
  await db
    .insertInto("blocked_guest")
    .values({ event_id: eventId, requester_token: requesterToken })
    .onConflict((oc) => oc.columns(["event_id", "requester_token"]).doNothing())
    .execute();
}
