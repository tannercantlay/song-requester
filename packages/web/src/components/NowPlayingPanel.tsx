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
 * The anchor of the queue page, and the one thing glanced at from across a
 * stage. Rendered unconditionally — an empty state is still a state, and a
 * panel that appears and disappears makes everything below it jump.
 *
 * It owns the primary action, which is the loop the whole night runs on:
 * nothing playing -> start the top request; something playing -> mark it
 * played.
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
    <section className="lit-edge relative overflow-hidden rounded-2xl border border-ink-500 bg-ink-700/80 p-5 backdrop-blur">
      {/* Warm wash pooling top-left, as if the panel is catching the stage
          light rather than being a flat filled rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-24 h-56 w-56 rounded-full bg-sodium/20 blur-3xl"
      />

      <div className="relative mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              current ? "animate-glow bg-sodium" : "bg-bone-faint/50"
            }`}
          />
          <h2 className="marquee-label">{current ? "On now" : "Stage empty"}</h2>
        </div>
        {paused && (
          <span className="nums rounded-full border border-sodium/40 px-2 py-0.5 text-[0.625rem] uppercase tracking-marquee text-sodium">
            Paused
          </span>
        )}
      </div>

      {current ? (
        <div className="relative">
          <p className="text-[1.75rem] font-extrabold leading-[1.1] tracking-tight text-bone">
            {current.title}
          </p>
          <p className="mt-1 truncate text-bone-dim">{current.artist}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatusChange(current.id, "played")}
            className="mt-5 h-12 w-full rounded-xl bg-bone text-sm font-bold uppercase tracking-marquee text-ink-900 transition active:scale-[0.98] disabled:opacity-50"
          >
            Mark played
          </button>
        </div>
      ) : (
        <div className="relative">
          <p className="text-[1.5rem] font-extrabold leading-tight text-bone-faint">
            {nextUp ? "Ready when you are" : "Nothing waiting"}
          </p>
          <p className="mt-1 text-sm text-bone-faint">
            {nextUp ? "Kick off the next request." : "Requests land here as guests scan."}
          </p>
          {nextUp && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatusChange(nextUp.id, "playing")}
              className="mt-5 w-full rounded-xl bg-sodium px-4 py-3 text-left text-ink-900 transition active:scale-[0.98] disabled:opacity-50"
            >
              <span className="nums block text-[0.625rem] uppercase tracking-marquee opacity-70">
                Play next
              </span>
              <span className="mt-0.5 block truncate text-base font-bold">{nextUp.title}</span>
              <span className="block truncate text-xs opacity-80">{nextUp.artist}</span>
            </button>
          )}
        </div>
      )}

      {/* Two numbers worth a glance. Mono + tabular so they don't jitter as
          they tick over mid-set. */}
      <dl className="relative mt-5 grid grid-cols-2 border-t border-ink-500 pt-4">
        <div className="border-r border-ink-500 text-center">
          <dt className="marquee-label">Waiting</dt>
          <dd className="nums mt-1 text-2xl font-medium text-sodium">{pendingCount}</dd>
        </div>
        <div className="text-center">
          <dt className="marquee-label">Played</dt>
          <dd className="nums mt-1 text-2xl font-medium text-bone">{playedCount}</dd>
        </div>
      </dl>
    </section>
  );
}
