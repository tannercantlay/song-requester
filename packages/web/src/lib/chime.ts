const MUTE_KEY = "setlist_chime_muted";

let audioCtx: AudioContext | null = null;

export function isChimeMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === "true";
}

export function setChimeMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, String(muted));
}

export function playChime(): void {
  if (isChimeMuted()) return;

  audioCtx ??= new AudioContext();
  const ctx = audioCtx;
  const now = ctx.currentTime;

  for (const [freq, start] of [
    [880, 0],
    [1320, 0.12],
  ] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.2, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + 0.3);
  }
}
