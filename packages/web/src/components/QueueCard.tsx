import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import type { QueueRequest } from "../api/client";

export interface ReorderControls {
  dragHandleRef: (el: HTMLElement | null) => void;
  dragAttributes: DraggableAttributes;
  dragListeners: DraggableSyntheticListeners;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

interface Props {
  request: QueueRequest;
  onStatusChange: (id: string, status: "playing" | "played" | "dismissed") => void;
  onBlock: (requesterToken: string) => void;
  pending: boolean;
  reorder?: ReorderControls;
}

export function QueueCard({ request, onStatusChange, onBlock, pending, reorder }: Props) {
  const guests = request.tokens.map((token) => {
    const note = request.notes.find((n) => n.requesterToken === token);
    return { token, label: note?.name || `Guest ${token.slice(0, 4)}` };
  });

  return (
    <li className="group rounded-xl border border-ink-500 bg-ink-800/60 p-3 transition hover:border-ink-400">
      {/* Stacks on a phone: side by side, three action buttons squeeze the
          song title down to "Vale…" and the card stops being readable. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
        {reorder && (
          <div className="flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              disabled={!reorder.canMoveUp}
              onClick={reorder.onMoveUp}
              className="text-bone-faint hover:text-bone disabled:opacity-20"
              aria-label="Move up"
            >
              ▲
            </button>
            <span
              ref={reorder.dragHandleRef}
              {...reorder.dragAttributes}
              {...reorder.dragListeners}
              className="cursor-grab select-none px-1 text-bone-faint"
              aria-label="Drag to reorder"
            >
              ⠿
            </span>
            <button
              type="button"
              disabled={!reorder.canMoveDown}
              onClick={reorder.onMoveDown}
              className="text-bone-faint hover:text-bone disabled:opacity-20"
              aria-label="Move down"
            >
              ▼
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.0625rem] font-bold leading-snug text-bone">{request.title}</p>
          <p className="truncate text-sm text-bone-dim">{request.artist}</p>
          {request.notes.map((note, i) => (
            <p key={i} className="mt-1 text-xs italic text-bone-faint">
              {note.name ? `${note.name}: ` : ""}
              {note.note}
            </p>
          ))}
        </div>
        </div>

        {/* 44px minimum on every control: used one-handed, in a dark room,
            often on a phone propped on a keyboard stand.
            Exactly one filled button per row — whichever action moves this
            request forward from where it is. Everything else is ghosted, so
            the eye lands on the next step instead of a row of equal colours. */}
        <div className="flex shrink-0 items-center justify-end gap-2">
          <span className="nums mr-auto text-[0.6875rem] text-bone-faint sm:mr-0">
            {request.voteCount}×
          </span>
          {request.status !== "playing" && request.status !== "played" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatusChange(request.id, "playing")}
              className="h-11 rounded-full bg-sodium px-5 text-sm font-bold text-ink-900 transition active:scale-[0.97] disabled:opacity-50"
            >
              Play
            </button>
          )}
          {request.status !== "played" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatusChange(request.id, "played")}
              className={`h-11 rounded-full px-4 text-sm font-medium disabled:opacity-50 ${
                request.status === "playing"
                  ? "bg-bone font-bold text-ink-900"
                  : "border border-ink-500 text-bone-dim"
              }`}
            >
              Played
            </button>
          )}
          {request.status !== "played" && request.status !== "dismissed" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatusChange(request.id, "dismissed")}
              className="h-11 rounded-full px-4 text-sm font-medium text-bone-faint hover:bg-ink-600 disabled:opacity-50"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {guests.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-bone-faint">
            Guests ({guests.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {guests.map((g) => (
              <li key={g.token} className="flex items-center justify-between text-xs text-bone-dim">
                <span>{g.label}</span>
                <button
                  type="button"
                  onClick={() => onBlock(g.token)}
                  className="text-ember hover:underline"
                >
                  Block
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
