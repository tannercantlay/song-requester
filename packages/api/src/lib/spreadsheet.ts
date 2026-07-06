import * as XLSX from "xlsx";

export interface ParsedRow {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
}

const TITLE_KEYS = ["title", "song", "song title", "track", "track title", "name"];
const ARTIST_KEYS = ["artist", "artist name", "performer"];
const ALBUM_KEYS = ["album", "album name"];
const GENRE_KEYS = ["genre", "category", "genre/category", "style"];

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function findValue(row: Record<string, unknown>, keys: string[]): string | undefined {
  const normalized = new Map(Object.entries(row).map(([k, v]) => [normalizeKey(k), v]));
  for (const key of keys) {
    const value = normalized.get(key);
    if (value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

export function parseSpreadsheet(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["File has no sheets"] };
  }

  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  raw.forEach((row, i) => {
    const rowNum = i + 2; // header row + 1-indexing
    const title = findValue(row, TITLE_KEYS);
    const artist = findValue(row, ARTIST_KEYS);
    const album = findValue(row, ALBUM_KEYS);
    const genre = findValue(row, GENRE_KEYS);

    if (!title || !artist) {
      errors.push(`Row ${rowNum}: missing ${!title ? "title" : "artist"}`);
      return;
    }
    rows.push({ title, artist, album, genre });
  });

  return { rows, errors };
}
