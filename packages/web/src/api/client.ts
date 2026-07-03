export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export interface EventPublic {
  id: string;
  name: string;
  requestsPaused: boolean;
}

export type GuestSongStatus = "none" | "pending" | "playing" | "played";

export interface GuestSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtUrl: string | null;
  durationMs: number | null;
  status: GuestSongStatus;
  voteCount: number;
}

export function fetchEventPublic(token: string): Promise<EventPublic> {
  return request(`/api/e/${token}`);
}

export function fetchGuestSongs(
  token: string,
  search: string,
): Promise<{ requestsPaused: boolean; songs: GuestSong[] }> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return request(`/api/e/${token}/songs${qs}`);
}

export function postSongRequest(
  token: string,
  body: { songId: string; requesterToken: string; name?: string; note?: string },
): Promise<{ id: string; status: string; voteCount: number }> {
  return request(`/api/e/${token}/requests`, { method: "POST", body: JSON.stringify(body) });
}

export interface AdminEvent {
  id: string;
  name: string;
  publicToken: string;
  status: "active" | "ended";
  requestsPaused: boolean;
  createdAt: string;
}

export function fetchAdminEvents(): Promise<AdminEvent[]> {
  return request("/api/events");
}

export interface QueueNote {
  requesterToken: string;
  name: string | null;
  note: string | null;
  createdAt: string;
}

export interface QueueRequest {
  id: string;
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtUrl: string | null;
  durationMs: number | null;
  status: "pending" | "playing" | "played" | "dismissed";
  voteCount: number;
  queuePosition: number | null;
  createdAt: string;
  updatedAt: string;
  playedAt: string | null;
  notes: QueueNote[];
  tokens: string[];
}

export function fetchAdminQueue(eventId: string): Promise<QueueRequest[]> {
  return request(`/api/events/${eventId}/requests`);
}

export function patchRequestStatus(
  requestId: string,
  status: "playing" | "played" | "dismissed",
): Promise<QueueRequest> {
  return request(`/api/requests/${requestId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function patchEvent(
  eventId: string,
  patch: { status?: "active" | "ended"; requestsPaused?: boolean },
): Promise<AdminEvent> {
  return request(`/api/events/${eventId}`, { method: "PATCH", body: JSON.stringify(patch) });
}
