import { useEffect } from "react";

const SSE_EVENT_NAMES = ["request.created", "request.updated", "queue.reordered", "event.updated"] as const;

export function useSSE(url: string | null, onEvent: () => void): void {
  useEffect(() => {
    if (!url) return;

    const source = new EventSource(url);
    for (const name of SSE_EVENT_NAMES) {
      source.addEventListener(name, onEvent);
    }

    return () => {
      source.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
}
