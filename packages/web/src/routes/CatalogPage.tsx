import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createSong,
  fetchAdminGenres,
  fetchMe,
  fetchSongsAdmin,
  fetchSpotifyPlaylists,
  importSongsFile,
  importSpotifyPlaylist,
  updateSong,
  type AdminSong,
} from "../api/client";

const GENRE_DATALIST_ID = "genre-suggestions";

function SongRow({ song }: { song: AdminSong }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [genre, setGenre] = useState(song.genre ?? "");

  const saveMutation = useMutation({
    mutationFn: () => updateSong(song.id, { title, artist, genre: genre.trim() || null }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["admin-songs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-genres"] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => updateSong(song.id, { isActive: !song.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-songs"] }),
  });

  if (editing) {
    return (
      <li className="flex items-center gap-2 border-b border-slate-100 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-1/3 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="w-1/3 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <input
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          placeholder="Genre"
          list={GENRE_DATALIST_ID}
          className="w-1/3 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600"
        >
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 border-b border-slate-100 py-2">
      <div className={`min-w-0 ${song.isActive ? "" : "opacity-40"}`}>
        <p className="truncate font-medium text-slate-900">{song.title}</p>
        <p className="truncate text-sm text-slate-500">
          {song.artist}
          {song.genre && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{song.genre}</span>}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => toggleActiveMutation.mutate()}
          disabled={toggleActiveMutation.isPending}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
        >
          {song.isActive ? "Hide" : "Show"}
        </button>
      </div>
    </li>
  );
}

function FileImportSection() {
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: (file: File) => importSongsFile(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-songs"] }),
  });

  return (
    <section className="mb-6 rounded-lg border border-slate-200 p-4">
      <p className="mb-2 text-sm text-slate-500">
        No Spotify? Import a catalog from a CSV or Excel file — columns "Title" and "Artist" required, "Album" optional.
      </p>
      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importMutation.mutate(file);
          e.target.value = "";
        }}
        disabled={importMutation.isPending}
        className="text-sm text-slate-600"
      />
      {importMutation.isPending && <p className="mt-2 text-sm text-slate-400">Importing…</p>}
      {importMutation.isError && (
        <p className="mt-2 text-sm text-red-600">
          {importMutation.error instanceof ApiError ? importMutation.error.message : "Import failed"}
        </p>
      )}
      {importMutation.isSuccess && (
        <div className="mt-2 text-sm">
          <p className="text-green-700">
            Imported {importMutation.data.imported}, skipped {importMutation.data.skipped} duplicate
            {importMutation.data.skipped === 1 ? "" : "s"}.
          </p>
          {importMutation.data.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-700">
              {importMutation.data.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function SpotifySection() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  useEffect(() => {
    if (searchParams.get("spotify") === "connected") {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  }, [searchParams, queryClient]);

  const playlistsQuery = useQuery({
    queryKey: ["spotify-playlists"],
    queryFn: fetchSpotifyPlaylists,
    enabled: !!meQuery.data?.spotifyConnected,
  });

  const importMutation = useMutation({
    mutationFn: (playlistId: string) => importSpotifyPlaylist(playlistId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-songs"] }),
  });

  if (!meQuery.data) return null;

  if (!meQuery.data.spotifyConnected) {
    return (
      <section className="mb-6 rounded-lg border border-slate-200 p-4">
        <p className="mb-2 text-sm text-slate-500">Connect Spotify to import playlists into your catalog.</p>
        <a
          href="/api/spotify/connect"
          className="inline-block rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white"
        >
          Connect Spotify
        </a>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-lg border border-slate-200 p-4">
      <p className="mb-2 text-sm text-slate-500">Spotify connected ✓</p>
      {playlistsQuery.isError && (
        <p className="text-sm text-red-600">
          {playlistsQuery.error instanceof ApiError ? playlistsQuery.error.message : "Couldn't load playlists"}
        </p>
      )}
      {importMutation.isSuccess && (
        <p className="mb-2 text-sm text-green-700">Imported {importMutation.data.imported} tracks.</p>
      )}
      <ul className="space-y-1">
        {playlistsQuery.data?.map((p) => (
          <li key={p.id} className="flex items-center justify-between text-sm">
            <span>
              {p.name} <span className="text-slate-400">({p.trackCount} tracks)</span>
            </span>
            <button
              type="button"
              onClick={() => importMutation.mutate(p.id)}
              disabled={importMutation.isPending}
              className="rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Import
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CatalogPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newArtist, setNewArtist] = useState("");
  const [newGenre, setNewGenre] = useState("");

  const songsQuery = useQuery({
    queryKey: ["admin-songs", search],
    queryFn: () => fetchSongsAdmin(search),
  });

  const genresQuery = useQuery({ queryKey: ["admin-genres"], queryFn: fetchAdminGenres });

  const addMutation = useMutation({
    mutationFn: () => createSong({ title: newTitle, artist: newArtist, genre: newGenre.trim() || undefined }),
    onSuccess: () => {
      setNewTitle("");
      setNewArtist("");
      setNewGenre("");
      queryClient.invalidateQueries({ queryKey: ["admin-songs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-genres"] });
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-6">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Catalog</h1>

      <datalist id={GENRE_DATALIST_ID}>
        {genresQuery.data?.map((g) => <option key={g} value={g} />)}
      </datalist>

      <SpotifySection />
      <FileImportSection />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newTitle && newArtist) addMutation.mutate();
        }}
        className="mb-4 flex gap-2"
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Title"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          value={newArtist}
          onChange={(e) => setNewArtist(e.target.value)}
          placeholder="Artist"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          value={newGenre}
          onChange={(e) => setNewGenre(e.target.value)}
          placeholder="Genre (optional)"
          list={GENRE_DATALIST_ID}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={addMutation.isPending}
          className="rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search catalog…"
        className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />

      <ul>{songsQuery.data?.map((song) => <SongRow key={song.id} song={song} />)}</ul>
    </div>
  );
}
