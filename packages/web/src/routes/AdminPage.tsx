import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminEvents, fetchAdminQueue, patchRequestStatus } from "../api/client";
import { useSSE } from "../lib/useSSE";
import { QueueCard } from "../components/QueueCard";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [eventId, setEventId] = useState<string | null>(null);

  const eventsQuery = useQuery({ queryKey: ["admin-events"], queryFn: fetchAdminEvents });

  useEffect(() => {
    if (!eventId && eventsQuery.data && eventsQuery.data.length > 0) {
      setEventId(eventsQuery.data[0].id);
    }
  }, [eventId, eventsQuery.data]);

  const queueQuery = useQuery({
    queryKey: ["admin-queue", eventId],
    queryFn: () => fetchAdminQueue(eventId!),
    enabled: !!eventId,
    refetchInterval: 15_000,
  });

  useSSE(eventId ? `/api/events/${eventId}/stream` : null, () => {
    queryClient.invalidateQueries({ queryKey: ["admin-queue", eventId] });
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "playing" | "played" | "dismissed" }) =>
      patchRequestStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-queue", eventId] }),
  });

  if (eventsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!eventsQuery.data || eventsQuery.data.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">No active events yet.</p>
      </div>
    );
  }

  const requests = queueQuery.data ?? [];
  const playing = requests.filter((r) => r.status === "playing");
  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status === "played" || r.status === "dismissed");

  const onStatusChange = (id: string, status: "playing" | "played" | "dismissed") =>
    statusMutation.mutate({ id, status });

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-white px-4 pb-12">
      <header className="sticky top-0 z-10 bg-white pb-3 pt-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          {eventsQuery.data.find((e) => e.id === eventId)?.name ?? "Admin"}
        </h1>
        <p className="text-sm text-slate-400">{requests.length} in queue</p>
      </header>

      {playing.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-xs font-semibold uppercase text-slate-400">Now Playing</h2>
          <ul className="space-y-2">
            {playing.map((r) => (
              <QueueCard key={r.id} request={r} onStatusChange={onStatusChange} pending={statusMutation.isPending} />
            ))}
          </ul>
        </section>
      )}

      <section className="mb-4">
        <h2 className="mb-2 text-xs font-semibold uppercase text-slate-400">Requests</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">No pending requests.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <QueueCard key={r.id} request={r} onStatusChange={onStatusChange} pending={statusMutation.isPending} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase text-slate-400">
            Played / Dismissed ({done.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {done.map((r) => (
              <QueueCard key={r.id} request={r} onStatusChange={onStatusChange} pending={statusMutation.isPending} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
