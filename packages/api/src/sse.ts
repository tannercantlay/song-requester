import { EventEmitter } from "node:events";
import type { FastifyReply } from "fastify";

export type SseEventName =
  | "request.created"
  | "request.updated"
  | "queue.reordered"
  | "event.updated";

const emitters = new Map<string, EventEmitter>();

function getEmitter(eventId: string): EventEmitter {
  let emitter = emitters.get(eventId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(50);
    emitters.set(eventId, emitter);
  }
  return emitter;
}

export function broadcast(eventId: string, name: SseEventName, data: unknown): void {
  getEmitter(eventId).emit("message", { name, data });
}

export function subscribe(eventId: string, reply: FastifyReply): void {
  const emitter = getEmitter(eventId);

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = ({ name, data }: { name: SseEventName; data: unknown }) => {
    reply.raw.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  emitter.on("message", send);

  const heartbeat = setInterval(() => {
    reply.raw.write(": ping\n\n");
  }, 20_000);

  reply.raw.on("close", () => {
    clearInterval(heartbeat);
    emitter.off("message", send);
  });
}
