import { useEffect, useState } from "react";

/**
 * Holds off on a value until it stops changing.
 *
 * The guest song search hits the API on every keystroke. On a phone over
 * venue wifi that is a request per character, each one racing the last, and
 * the list flickers as they land out of order. Waiting for a pause in typing
 * turns "Wonderwall" from eleven requests into one.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
