import { useEffect, useRef } from "react";

export type SseEventName = "request.created" | "request.updated" | "queue.reordered" | "event.updated";

const SSE_EVENT_NAMES: SseEventName[] = [
  "request.created",
  "request.updated",
  "queue.reordered",
  "event.updated",
];

export function useSSE(url: string | null, onEvent: (name: SseEventName) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!url) return;

    const source = new EventSource(url);
    const listeners = SSE_EVENT_NAMES.map((name) => {
      const listener = () => handlerRef.current(name);
      source.addEventListener(name, listener);
      return { name, listener };
    });

    return () => {
      for (const { name, listener } of listeners) {
        source.removeEventListener(name, listener);
      }
      source.close();
    };
  }, [url]);
}
