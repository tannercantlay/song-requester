const STORAGE_KEY = "setlist_guest_token";

export function getGuestToken(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const token = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, token);
  return token;
}
