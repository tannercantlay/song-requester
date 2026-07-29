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

  const pill = "h-11 rounded-full px-4 text-sm font-medium";

  return (
    <header className="sticky top-0 z-10 border-b border-slate-100 bg-white pb-3 pt-4">
      {events.length > 1 && (
        <label className="mb-2 flex items-center gap-2 text-xs text-slate-400">
          <span>Event</span>
          <select
            value={event.id}
            onChange={(e) => onSelectEvent(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-700"
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
              className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-lg font-semibold text-slate-900 outline-none focus:border-purple-400"
            />
            <button
              type="submit"
              disabled={renaming}
              className={`${pill} bg-purple-600 text-white disabled:opacity-50`}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              className={`${pill} bg-slate-200 text-slate-600`}
            >
              Cancel
            </button>
          </form>
        ) : (
          // Takes its own line on a phone: sharing the row with four controls
          // truncated real event names down to "Friday at…".
          <h1 className="w-full min-w-0 truncate text-2xl font-semibold text-slate-900 sm:w-auto sm:flex-1">
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
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {event.requestsPaused ? "Resume" : "Pause"}
            </button>
            <button type="button" onClick={onShowQr} className={`${pill} bg-slate-100 text-slate-600`}>
              QR
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? "Unmute chime" : "Mute chime"}
              className="h-11 w-11 rounded-full bg-slate-100 text-slate-600"
            >
              {muted ? "🔇" : "🔔"}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-expanded={menuOpen}
                className="h-11 w-11 rounded-full bg-slate-100 text-slate-600"
              >
                ⋯
              </button>
              {menuOpen && (
                <>
                  {/* Full-screen backdrop so a tap anywhere dismisses the menu —
                      more forgiving than an outside-click listener on a phone. */}
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={startRename}
                      className="block w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Rename event
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(true);
                        setMenuOpen(false);
                      }}
                      className="block w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      New event
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmEnd(true);
                        setMenuOpen(false);
                      }}
                      className="block w-full border-t border-slate-100 px-4 py-3 text-left text-sm text-rose-600 hover:bg-rose-50"
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
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 p-3">
          <p className="flex-1 text-sm text-rose-800">
            End <strong>{event.name}</strong>? Guests scanning the QR code will see “This event has
            ended” and can no longer request songs. The queue is kept, but this can’t be undone
            from here.
          </p>
          <button
            type="button"
            disabled={ending}
            onClick={onEnd}
            className={`${pill} bg-rose-600 text-white disabled:opacity-50`}
          >
            {ending ? "Ending…" : "End event"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmEnd(false)}
            className={`${pill} bg-white text-slate-600`}
          >
            Cancel
          </button>
        </div>
      )}

      {creating && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
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
