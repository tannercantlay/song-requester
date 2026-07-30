import { QRCodeSVG } from "qrcode.react";

interface Props {
  eventName: string;
  publicToken: string;
  onClose: () => void;
}

export function QrCard({ eventName, publicToken, onClose }: Props) {
  const guestUrl = `${window.location.origin}/e/${publicToken}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:static print:bg-transparent">
      <div className="qr-print-card flex flex-col items-center gap-4 rounded-2xl bg-ink-700 p-8 shadow-xl print:shadow-none">
        <h2 className="text-xl font-semibold text-bone">{eventName}</h2>
        {/* level Q tolerates a smudge or a creased corner where the default L
            does not, and marginSize 4 is the quiet zone the QR spec requires —
            without it scanners struggle against a busy background. */}
        <QRCodeSVG value={guestUrl} size={220} level="Q" marginSize={4} />
        <p className="text-sm text-bone-dim">Scan to request a song</p>
        <p className="break-all text-xs text-bone-faint">{guestUrl}</p>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-sodium px-4 py-2 text-sm font-medium text-ink-900"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-ink-500 px-4 py-2 text-sm font-medium text-bone"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
