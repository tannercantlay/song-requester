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
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        {reorder && (
          <div className="flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              disabled={!reorder.canMoveUp}
              onClick={reorder.onMoveUp}
              className="text-slate-400 hover:text-slate-700 disabled:opacity-20"
              aria-label="Move up"
            >
              ▲
            </button>
            <span
              ref={reorder.dragHandleRef}
              {...reorder.dragAttributes}
              {...reorder.dragListeners}
              className="cursor-grab select-none px-1 text-slate-300"
              aria-label="Drag to reorder"
            >
              ⠿
            </span>
            <button
              type="button"
              disabled={!reorder.canMoveDown}
              onClick={reorder.onMoveDown}
              className="text-slate-400 hover:text-slate-700 disabled:opacity-20"
              aria-label="Move down"
            >
              ▼
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">{request.title}</p>
          <p className="truncate text-sm text-slate-500">{request.artist}</p>
          {request.notes.map((note, i) => (
            <p key={i} className="mt-1 text-xs italic text-slate-400">
              {note.name ? `${note.name}: ` : ""}
              {note.note}
            </p>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-slate-400">{request.voteCount} votes</span>
          {request.status !== "playing" && request.status !== "played" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatusChange(request.id, "playing")}
              className="rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Now Playing
            </button>
          )}
          {request.status !== "played" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatusChange(request.id, "played")}
              className="rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Played
            </button>
          )}
          {request.status !== "played" && request.status !== "dismissed" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatusChange(request.id, "dismissed")}
              className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 disabled:opacity-50"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {guests.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-400">
            Guests ({guests.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {guests.map((g) => (
              <li key={g.token} className="flex items-center justify-between text-xs text-slate-500">
                <span>{g.label}</span>
                <button
                  type="button"
                  onClick={() => onBlock(g.token)}
                  className="text-red-500 hover:underline"
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
