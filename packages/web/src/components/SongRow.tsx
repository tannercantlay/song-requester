import type { GuestSong } from "../api/client";

interface Props {
  song: GuestSong;
  onRequest: (songId: string) => void;
  pending: boolean;
}

/**
 * One song in the guest list.
 *
 * What a guest sees is deliberately scoped to their own activity. Showing a
 * shared "Requested ✓" the moment anyone asked for a song made the row look
 * spent, so people scrolled past songs they actually wanted rather than adding
 * to them — the button was still live, but nothing said so. Now the only
 * request state a guest sees is their own; everything else reads "Request".
 *
 * Vote counts are gone from this view for the same reason: "4 votes" beside a
 * "Request" button is the same leak wearing a different hat. The host still
 * sees every count on the queue page, which is where it drives decisions.
 */
export function SongRow({ song, onRequest, pending }: Props) {
  // Two states are facts about the room rather than about other guests, and
  // both earn their place: the API rejects re-requesting a played song with a
  // 409, and asking for the song currently being played is pointless.
  const label =
    song.status === "played"
      ? "Played"
      : song.status === "playing"
        ? "On now"
        : song.requestedByYou
          ? "Requested ✓"
          : null;

  const isYours = song.requestedByYou && song.status === "pending";

  return (
    <li className="flex items-center justify-between gap-3 border-b border-ink-500 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold text-bone">{song.title}</p>
        <p className="truncate text-sm text-bone-dim">
          {song.artist}
          {song.genre && (
            <span className="ml-2 rounded-full bg-ink-600 px-2 py-0.5 text-xs text-bone-faint">
              {song.genre}
            </span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center">
        {label ? (
          // Static, not a button. Each of these is a no-op server-side, and a
          // control that looks tappable but does nothing is what caused the
          // confusion in the first place.
          <span
            className={`rounded-full px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-marquee ${
              isYours ? "border border-sodium/40 text-sodium" : "text-bone-faint"
            }`}
          >
            {label}
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => onRequest(song.id)}
            className="h-11 rounded-full bg-sodium px-5 text-sm font-bold text-ink-900 transition active:scale-[0.97] disabled:opacity-50"
          >
            Request
          </button>
        )}
      </div>
    </li>
  );
}
