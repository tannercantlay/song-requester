// Minimal profanity list for MVP moderation of guest name/dedication fields.
// Not exhaustive — revisit if abuse shows up in practice.
const BLOCKED_WORDS = ["fuck", "shit", "bitch", "asshole", "cunt", "nigger", "faggot"];

export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

export function containsProfanity(input: string): boolean {
  const lower = input.toLowerCase();
  return BLOCKED_WORDS.some((word) => lower.includes(word));
}

export function sanitizeGuestText(input: string): string {
  return stripHtml(input).trim();
}
