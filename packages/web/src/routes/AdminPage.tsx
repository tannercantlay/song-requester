import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  blockGuest,
  fetchAdminEvents,
  fetchAdminQueue,
  patchEvent,
  patchRequestStatus,
  reorderQueue,
  type QueueRequest,
} from "../api/client";
import { useSSE } from "../lib/useSSE";
import { isChimeMuted, playChime, setChimeMuted } from "../lib/chime";
import { QueueCard } from "../components/QueueCard";
import { SortableQueueItem } from "../components/SortableQueueItem";
import { QrCard } from "../components/QrCard";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [eventId, setEventId] = useState<string | null>(null);
  const [muted, setMuted] = useState(isChimeMuted());
  const [showQr, setShowQr] = useState(false);

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

  useSSE(eventId ? `/api/events/${eventId}/stream` : null, (name) => {
    queryClient.invalidateQueries({ queryKey: ["admin-queue", eventId] });
    if (name === "event.updated") {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    }
    if (name === "request.created") {
      playChime();
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "playing" | "played" | "dismissed" }) =>
      patchRequestStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-queue", eventId] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (order: string[]) => reorderQueue(eventId!, order),
    onSuccess: (data) => queryClient.setQueryData(["admin-queue", eventId], data),
  });

  const blockMutation = useMutation({
    mutationFn: (requesterToken: string) => blockGuest(eventId!, requesterToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-queue", eventId] }),
  });

  const pauseMutation = useMutation({
    mutationFn: (requestsPaused: boolean) => patchEvent(eventId!, { requestsPaused }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-events"] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const event = eventsQuery.data.find((e) => e.id === eventId);
  const requests: QueueRequest[] = queueQuery.data ?? [];
  const playing = requests.filter((r) => r.status === "playing");
  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status === "played" || r.status === "dismissed");
  const pendingIds = pending.map((r) => r.id);

  const onStatusChange = (id: string, status: "playing" | "played" | "dismissed") =>
    statusMutation.mutate({ id, status });

  const onBlock = (requesterToken: string) => blockMutation.mutate(requesterToken);

  const moveInPending = (from: number, to: number) => {
    if (to < 0 || to >= pendingIds.length) return;
    reorderMutation.mutate(arrayMove(pendingIds, from, to));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = pendingIds.indexOf(String(active.id));
    const to = pendingIds.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    reorderMutation.mutate(arrayMove(pendingIds, from, to));
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setChimeMuted(next);
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-white px-4 pb-12">
      <header className="sticky top-0 z-10 bg-white pb-3 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">{event?.name ?? "Admin"}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
            >
              {muted ? "🔇 Muted" : "🔔 Sound on"}
            </button>
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
            >
              Show QR
            </button>
            {event && (
              <button
                type="button"
                disabled={pauseMutation.isPending}
                onClick={() => pauseMutation.mutate(!event.requestsPaused)}
                className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                  event.requestsPaused ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {event.requestsPaused ? "Resume requests" : "Pause requests"}
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-400">{requests.length} in queue</p>
      </header>

      {playing.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-xs font-semibold uppercase text-slate-400">Now Playing</h2>
          <ul className="space-y-2">
            {playing.map((r) => (
              <QueueCard
                key={r.id}
                request={r}
                onStatusChange={onStatusChange}
                onBlock={onBlock}
                pending={statusMutation.isPending}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mb-4">
        <h2 className="mb-2 text-xs font-semibold uppercase text-slate-400">Requests</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">No pending requests.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pendingIds} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {pending.map((r, i) => (
                  <SortableQueueItem
                    key={r.id}
                    request={r}
                    onStatusChange={onStatusChange}
                    onBlock={onBlock}
                    pending={statusMutation.isPending}
                    onMoveUp={() => moveInPending(i, i - 1)}
                    onMoveDown={() => moveInPending(i, i + 1)}
                    canMoveUp={i > 0}
                    canMoveDown={i < pending.length - 1}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>

      {done.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase text-slate-400">
            Played / Dismissed ({done.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {done.map((r) => (
              <QueueCard
                key={r.id}
                request={r}
                onStatusChange={onStatusChange}
                onBlock={onBlock}
                pending={statusMutation.isPending}
              />
            ))}
          </ul>
        </details>
      )}

      {showQr && event && (
        <QrCard eventName={event.name} publicToken={event.publicToken} onClose={() => setShowQr(false)} />
      )}
    </div>
  );
}
