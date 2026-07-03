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
      <div className="qr-print-card flex flex-col items-center gap-4 rounded-2xl bg-white p-8 shadow-xl print:shadow-none">
        <h2 className="text-xl font-semibold text-slate-900">{eventName}</h2>
        <QRCodeSVG value={guestUrl} size={220} />
        <p className="text-sm text-slate-500">Scan to request a song</p>
        <p className="break-all text-xs text-slate-400">{guestUrl}</p>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
