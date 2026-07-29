import type { QueueRequest } from "../api/client";

interface Props {
  playing: QueueRequest[];
  nextUp: QueueRequest | null;
  pendingCount: number;
  playedCount: number;
  paused: boolean;
  busy: boolean;
  onStatusChange: (id: string, status: "playing" | "played" | "dismissed") => void;
}

/**
 * The anchor of the queue page. Rendered unconditionally — an empty state is
 * still a state, and the host needs "what's on right now" to live in one fixed
 * place they can glance at mid-song rather than a section that appears and
 * disappears and shifts everything below it.
 *
 * It also owns the primary action, which is the loop the whole gig runs on:
 * nothing playing -> start the top request; something playing -> mark it
 * played. Both were previously buried inside individual queue cards.
 */
export function NowPlayingPanel({
  playing,
  nextUp,
  pendingCount,
  playedCount,
  paused,
  busy,
  onStatusChange,
}: Props) {
  const current = playing[0] ?? null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Now playing
        </h2>
        {paused && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Requests paused
          </span>
        )}
      </div>

      {current ? (
        <>
          <p className="truncate text-2xl font-semibold leading-tight text-slate-900">
            {current.title}
          </p>
          <p className="mb-4 truncate text-slate-500">{current.artist}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatusChange(current.id, "played")}
            className="h-12 w-full rounded-xl bg-green-600 text-base font-semibold text-white disabled:opacity-50"
          >
            Mark played
          </button>
        </>
      ) : (
        <>
          <p className="text-lg font-medium text-slate-400">Nothing playing</p>
          <p className="mb-4 text-sm text-slate-400">
            {nextUp ? "Start the next request when you're ready." : "No requests waiting yet."}
          </p>
          {nextUp && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatusChange(nextUp.id, "playing")}
              className="h-12 w-full rounded-xl bg-purple-600 px-4 text-left text-white disabled:opacity-50"
            >
              <span className="block text-xs font-medium uppercase tracking-wide text-purple-200">
                Play next
              </span>
              <span className="block truncate text-sm font-semibold">
                {nextUp.title} — {nextUp.artist}
              </span>
            </button>
          )}
        </>
      )}

      {/* Two numbers the host actually wants at a glance; previously the only
          stat was a bare "N in queue" that mixed pending with everything else. */}
      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-center">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Waiting</dt>
          <dd className="text-xl font-semibold text-slate-900">{pendingCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Played</dt>
          <dd className="text-xl font-semibold text-slate-900">{playedCount}</dd>
        </div>
      </dl>
    </section>
  );
}
