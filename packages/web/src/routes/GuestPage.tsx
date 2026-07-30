import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, fetchEventPublic, fetchGuestSongs, postSongRequest } from "../api/client";
import { getGuestToken } from "../lib/guestToken";
import { SongRow } from "../components/SongRow";

export default function GuestPage() {
  const { token = "" } = useParams();
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const guestToken = getGuestToken();

  const eventQuery = useQuery({
    queryKey: ["event", token],
    queryFn: () => fetchEventPublic(token),
    retry: false,
  });

  const songsQuery = useQuery({
    queryKey: ["songs", token, search, genre],
    queryFn: () => fetchGuestSongs(token, search, genre || undefined),
    enabled: eventQuery.isSuccess,
  });

  const requestMutation = useMutation({
    mutationFn: (songId: string) =>
      postSongRequest(token, {
        songId,
        requesterToken: guestToken,
        name: name.trim() || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["songs", token] });
    },
  });

  if (eventQuery.isError) {
    const status = eventQuery.error instanceof ApiError ? eventQuery.error.status : 0;
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <p className="text-bone-dim">
          {status === 410 ? "This event has ended." : "Event not found."}
        </p>
      </div>
    );
  }

  if (eventQuery.isLoading || !eventQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-bone-faint">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-ink-700 px-4 pb-12">
      <header className="sticky top-0 z-10 bg-ink-700 pb-3 pt-6">
        <h1 className="text-2xl font-semibold text-bone">{eventQuery.data.name}</h1>
        {eventQuery.data.requestsPaused && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-sodium">
            Requests are paused — check back soon.
          </p>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search songs or artists…"
          className="mt-3 w-full rounded-lg border border-ink-500 px-3 py-2 text-sm outline-none focus:border-sodium"
        />

        {songsQuery.data && songsQuery.data.genres.length > 0 && (
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="mt-2 w-full rounded-lg border border-ink-500 px-3 py-2 text-sm outline-none focus:border-sodium"
          >
            <option value="">All genres</option>
            {songsQuery.data.genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}

        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-bone-faint">
            Add your name / a dedication (optional)
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-ink-500 px-3 py-2 text-sm outline-none focus:border-sodium"
            />
            <input
              type="text"
              value={note}
              maxLength={80}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dedication, e.g. for the birthday girl"
              className="w-full rounded-lg border border-ink-500 px-3 py-2 text-sm outline-none focus:border-sodium"
            />
          </div>
        </details>

        {requestMutation.isError && (
          <p className="mt-2 text-sm text-ember">
            {requestMutation.error instanceof ApiError
              ? requestMutation.error.message
              : "Something went wrong"}
          </p>
        )}
      </header>

      <ul>
        {songsQuery.data?.songs.map((song) => (
          <SongRow
            key={song.id}
            song={song}
            pending={
              requestMutation.isPending && requestMutation.variables === song.id
            }
            onRequest={(songId) => {
              if (eventQuery.data.requestsPaused) return;
              requestMutation.mutate(songId);
            }}
          />
        ))}
      </ul>

      {songsQuery.data?.songs.length === 0 && (
        <p className="py-8 text-center text-bone-faint">No songs match your search.</p>
      )}
    </div>
  );
}
