import type { QueueRequest } from "../api/client";

interface Props {
  request: QueueRequest;
  onStatusChange: (id: string, status: "playing" | "played" | "dismissed") => void;
  pending: boolean;
}

export function QueueCard({ request, onStatusChange, pending }: Props) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
      <div className="min-w-0">
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
    </li>
  );
}
