import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { fetchAdminEvents } from "../api/client";

type Layout = "cards" | "poster";

// Four quarter-page cards per sheet: cut along the middle and you get table
// tents. A poster is one per sheet for a door or the front of the stage.
const COPIES: Record<Layout, number> = { cards: 4, poster: 1 };

const DEFAULT_HEADLINE = "Scan to request a song";

export default function PrintPage() {
  const eventsQuery = useQuery({ queryKey: ["admin-events"], queryFn: fetchAdminEvents });
  const [eventId, setEventId] = useState<string | null>(null);
  const [headline, setHeadline] = useState(DEFAULT_HEADLINE);
  const [message, setMessage] = useState("");
  const [layout, setLayout] = useState<Layout>("cards");

  useEffect(() => {
    if (!eventId && eventsQuery.data && eventsQuery.data.length > 0) {
      setEventId(eventsQuery.data[0].id);
    }
  }, [eventId, eventsQuery.data]);

  const event = eventsQuery.data?.find((e) => e.id === eventId);

  if (eventsQuery.isLoading) {
    return <p className="p-8 text-slate-400">Loading…</p>;
  }

  if (!event) {
    return (
      <div className="p-8">
        <p className="text-slate-500">
          Create an event on the Queue page first — the QR code points at its guest link.
        </p>
      </div>
    );
  }

  const guestUrl = `${window.location.origin}/e/${event.publicToken}`;
  const copies = Array.from({ length: COPIES[layout] }, (_, i) => i);

  return (
    <div className="print-page mx-auto max-w-4xl p-4">
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-slate-900">Print QR codes</h1>
        <p className="mb-4 text-sm text-slate-500">
          Put these on tables so guests can scan and request songs.
        </p>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          {eventsQuery.data && eventsQuery.data.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Event</span>
              <select
                value={event.id}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {eventsQuery.data.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Layout</span>
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as Layout)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="cards">Table cards — 4 per page</option>
              <option value="poster">Poster — 1 per page</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Headline</span>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={60}
              placeholder={DEFAULT_HEADLINE}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Message <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={120}
              placeholder="e.g. No cover charge — just pick a song!"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-purple-600 px-5 py-2 text-sm font-medium text-white"
          >
            Print
          </button>
          <p className="text-xs text-slate-400">
            Print at 100% scale (not “fit to page”) so the code stays a scannable size.
          </p>
        </div>

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Preview
        </h2>
      </div>

      <div className="print-sheet" data-layout={layout}>
        {copies.map((i) => (
          <article className="print-card" key={i}>
            <p className="print-card__event">{event.name}</p>
            <h2 className="print-card__headline">{headline || DEFAULT_HEADLINE}</h2>
            <div className="print-card__qr">
              <QRCodeSVG
                value={guestUrl}
                // level Q survives a smudge or a folded corner; the default L
                // does not. marginSize 4 is the quiet zone the QR spec requires
                // — without it scanners struggle against a busy tabletop.
                level="Q"
                marginSize={4}
                size={1024}
                style={{ width: "100%", height: "auto", display: "block" }}
                title={`Request a song at ${event.name}`}
              />
            </div>
            {message && <p className="print-card__message">{message}</p>}
            <p className="print-card__url">{guestUrl}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
