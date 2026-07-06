export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch("/api/auth/csrf");
  const body = await res.json();
  csrfToken = body.csrfToken;
  return csrfToken!;
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE", "PUT"]);

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) };

  if (MUTATING_METHODS.has(method)) {
    headers["x-csrf-token"] = await getCsrfToken();
  }

  const res = await fetch(url, { ...init, method, headers });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

async function uploadFile<T>(url: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  // Don't set Content-Type manually — the browser needs to add its own
  // multipart boundary, which it can only do if it builds the header itself.
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-csrf-token": await getCsrfToken() },
    body: formData,
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
  genre: string | null;
  status: GuestSongStatus;
  voteCount: number;
}

export function fetchEventPublic(token: string): Promise<EventPublic> {
  return request(`/api/e/${token}`);
}

export function fetchGuestSongs(
  token: string,
  search: string,
  genre?: string,
): Promise<{ requestsPaused: boolean; songs: GuestSong[]; genres: string[] }> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (genre) params.set("genre", genre);
  const qs = params.toString() ? `?${params.toString()}` : "";
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
  patch: { name?: string; status?: "active" | "ended"; requestsPaused?: boolean },
): Promise<AdminEvent> {
  return request(`/api/events/${eventId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function reorderQueue(eventId: string, order: string[]): Promise<QueueRequest[]> {
  return request(`/api/events/${eventId}/reorder`, {
    method: "POST",
    body: JSON.stringify({ order }),
  });
}

export function blockGuest(eventId: string, requesterToken: string): Promise<void> {
  return request(`/api/events/${eventId}/block`, {
    method: "POST",
    body: JSON.stringify({ requesterToken }),
  });
}

// --- Auth ---

export interface Me {
  id: string;
  email: string;
  spotifyConnected: boolean;
}

export function login(email: string, password: string): Promise<{ id: string; email: string }> {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<void> {
  return request("/api/auth/logout", { method: "POST" });
}

export function fetchMe(): Promise<Me> {
  return request("/api/me");
}

// --- Catalog (songs) ---

export interface AdminSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtUrl: string | null;
  durationMs: number | null;
  genre: string | null;
  spotifyUri: string | null;
  isActive: boolean;
}

export function fetchSongsAdmin(search: string): Promise<AdminSong[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return request(`/api/songs${qs}`);
}

export function fetchAdminGenres(): Promise<string[]> {
  return request("/api/songs/genres");
}

export function createSong(input: { title: string; artist: string; genre?: string }): Promise<AdminSong> {
  return request("/api/songs", { method: "POST", body: JSON.stringify(input) });
}

export function updateSong(
  id: string,
  patch: Partial<{ title: string; artist: string; genre: string | null; isActive: boolean }>,
): Promise<AdminSong> {
  return request(`/api/songs/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function hideSong(id: string): Promise<void> {
  return request(`/api/songs/${id}`, { method: "DELETE" });
}

export interface ImportSongsResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function importSongsFile(file: File): Promise<ImportSongsResult> {
  return uploadFile("/api/songs/import", file);
}

// --- Spotify ---

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
}

export function fetchSpotifyPlaylists(): Promise<SpotifyPlaylist[]> {
  return request("/api/spotify/playlists");
}

export function importSpotifyPlaylist(playlistId: string): Promise<{ imported: number }> {
  return request("/api/spotify/import", { method: "POST", body: JSON.stringify({ playlistId }) });
}

// --- Admin management ---

export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
}

export function fetchAdmins(): Promise<AdminUser[]> {
  return request("/api/admins");
}

export function createAdminUser(email: string, password: string): Promise<AdminUser> {
  return request("/api/admins", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function deleteAdminUser(id: string): Promise<void> {
  return request(`/api/admins/${id}`, { method: "DELETE" });
}
