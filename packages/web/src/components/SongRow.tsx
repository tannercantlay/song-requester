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
    <li className="flex items-center justify-between gap-3 border-b border-ink-500 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-bone">{song.title}</p>
        <p className="truncate text-sm text-bone-dim">
          {song.artist}
          {song.genre && <span className="ml-2 rounded-full bg-ink-600 px-2 py-0.5 text-xs text-bone-dim">{song.genre}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {song.voteCount > 0 && <span className="text-xs text-bone-faint">{song.voteCount} votes</span>}
        {isPlayed ? (
          <span className="rounded-full bg-ink-600 px-3 py-1 text-xs font-medium text-bone-dim">
            Already played ✓
          </span>
        ) : isRequested ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onRequest(song.id)}
            className="rounded-full bg-sodium/15 px-3 py-1 text-xs font-medium text-sodium disabled:opacity-50"
          >
            Requested ✓
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => onRequest(song.id)}
            className="rounded-full bg-sodium px-3 py-1 text-xs font-medium text-ink-900 disabled:opacity-50"
          >
            Request
          </button>
        )}
      </div>
    </li>
  );
}
