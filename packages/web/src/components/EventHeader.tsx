import { useState } from "react";
import type { AdminEvent } from "../api/client";
import { NewEventForm } from "./NewEventForm";

interface Props {
  events: AdminEvent[];
  event: AdminEvent;
  onSelectEvent: (id: string) => void;
  muted: boolean;
  onToggleMute: () => void;
  onShowQr: () => void;
  onRename: (name: string) => void;
  renaming: boolean;
  onTogglePause: () => void;
  pausing: boolean;
  onEnd: () => void;
  ending: boolean;
}

/**
 * Event-level chrome. The controls are split by how often they get used and
 * how much they cost if hit by accident: pause/QR/sound are gig-frequency and
 * stay visible; rename, new event, and end event are once-a-night at most and
 * live behind the overflow menu. Previously all six were identical pills in
 * one row, so "End event" — irreversible — looked exactly like "Sound on".
 */
export function EventHeader({
  events,
  event,
  onSelectEvent,
  muted,
  onToggleMute,
  onShowQr,
  onRename,
  renaming,
  onTogglePause,
  pausing,
  onEnd,
  ending,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const startRename = () => {
    setNameDraft(event.name);
    setEditingName(true);
    setMenuOpen(false);
  };

  const pill =
    "h-11 rounded-full px-4 text-sm font-medium transition active:scale-[0.97] disabled:opacity-50";

  return (
    <header className="sticky top-0 z-20 -mx-4 border-b border-ink-500/70 bg-ink-900/85 px-4 pb-3 pt-4 backdrop-blur-md">
      {events.length > 1 && (
        <label className="mb-2 flex items-center gap-2">
          <span className="marquee-label">Event</span>
          <select
            value={event.id}
            onChange={(e) => onSelectEvent(e.target.value)}
            className="nums h-9 rounded-lg border border-ink-500 bg-ink-700 px-2 text-xs text-bone"
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {editingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nameDraft.trim()) {
                onRename(nameDraft.trim());
                setEditingName(false);
              }
            }}
            className="flex flex-1 flex-wrap items-center gap-2"
          >
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={120}
              className="h-11 min-w-0 flex-1 rounded-lg border border-ink-500 px-3 text-lg font-semibold text-bone outline-none focus:border-sodium"
            />
            <button
              type="submit"
              disabled={renaming}
              className={`${pill} bg-sodium text-ink-900 disabled:opacity-50`}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              className={`${pill} bg-ink-500 text-bone-dim`}
            >
              Cancel
            </button>
          </form>
        ) : (
          // Takes its own line on a phone: sharing the row with four controls
          // truncated real event names down to "Friday at…".
          <h1 className="w-full min-w-0 truncate text-[1.6rem] font-extrabold leading-tight tracking-tight text-bone sm:w-auto sm:flex-1">
            {event.name}
          </h1>
        )}

        {!editingName && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePause}
              disabled={pausing}
              className={`${pill} disabled:opacity-50 ${
                event.requestsPaused
                  ? "border border-sodium/50 bg-sodium/10 text-sodium"
                  : "border border-ink-500 text-bone-dim hover:border-ink-400 hover:text-bone"
              }`}
            >
              {event.requestsPaused ? "Resume" : "Pause"}
            </button>
            <button type="button" onClick={onShowQr} className={`${pill} border border-ink-500 text-bone-dim hover:border-ink-400 hover:text-bone`}>
              QR
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? "Unmute chime" : "Mute chime"}
              className="h-11 w-11 rounded-full border border-ink-500 text-bone-dim transition hover:border-ink-400 hover:text-bone"
            >
              {muted ? "🔇" : "🔔"}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-expanded={menuOpen}
                className="h-11 w-11 rounded-full border border-ink-500 text-bone-dim transition hover:border-ink-400 hover:text-bone"
              >
                ⋯
              </button>
              {menuOpen && (
                <>
                  {/* Full-screen backdrop so a tap anywhere dismisses the menu —
                      more forgiving than an outside-click listener on a phone. */}
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="lit-edge absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-ink-500 bg-ink-800 py-1">
                    <button
                      type="button"
                      onClick={startRename}
                      className="block w-full px-4 py-3 text-left text-sm text-bone-dim transition hover:bg-ink-600 hover:text-bone"
                    >
                      Rename event
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(true);
                        setMenuOpen(false);
                      }}
                      className="block w-full px-4 py-3 text-left text-sm text-bone-dim transition hover:bg-ink-600 hover:text-bone"
                    >
                      New event
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmEnd(true);
                        setMenuOpen(false);
                      }}
                      className="block w-full border-t border-ink-500 px-4 py-3 text-left text-sm text-ember transition hover:bg-ember/10"
                    >
                      End event
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {confirmEnd && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-ember/40 bg-ember/10 p-3">
          <p className="flex-1 text-sm text-bone-dim">
            End <strong>{event.name}</strong>? Guests scanning the QR code will see “This event has
            ended” and can no longer request songs. The queue is kept, but this can’t be undone
            from here.
          </p>
          <button
            type="button"
            disabled={ending}
            onClick={onEnd}
            className={`${pill} bg-ember text-ink-900 disabled:opacity-50`}
          >
            {ending ? "Ending…" : "End event"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmEnd(false)}
            className={`${pill} border border-ink-500 text-bone-dim`}
          >
            Cancel
          </button>
        </div>
      )}

      {creating && (
        <div className="mt-3 rounded-xl border border-ink-500 p-3">
          <NewEventForm
            autoFocus
            onCancel={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              onSelectEvent(id);
            }}
          />
        </div>
      )}
    </header>
  );
}
