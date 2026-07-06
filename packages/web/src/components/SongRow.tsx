import type { GuestSong } from "../api/client";

interface Props {
  song: GuestSong;
  onRequest: (songId: string) => void;
  pending: boolean;
}

export function SongRow({ song, onRequest, pending }: Props) {
  const isPlayed = song.status === "played";
  const isRequested = song.status === "pending" || song.status === "playing";

  return (
    <li className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{song.title}</p>
        <p className="truncate text-sm text-slate-500">
          {song.artist}
          {song.genre && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{song.genre}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {song.voteCount > 0 && <span className="text-xs text-slate-400">{song.voteCount} votes</span>}
        {isPlayed ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            Already played ✓
          </span>
        ) : isRequested ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onRequest(song.id)}
            className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 disabled:opacity-50"
          >
            Requested ✓
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => onRequest(song.id)}
            className="rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Request
          </button>
        )}
      </div>
    </li>
  );
}
