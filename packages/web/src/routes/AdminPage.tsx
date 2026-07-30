import { useEffect, useState, type CSSProperties } from "react";
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
import { EventHeader } from "../components/EventHeader";
import { NewEventForm } from "../components/NewEventForm";
import { NowPlayingPanel } from "../components/NowPlayingPanel";

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

  const renameMutation = useMutation({
    mutationFn: (name: string) => patchEvent(eventId!, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-events"] }),
  });

  const endMutation = useMutation({
    mutationFn: () => patchEvent(eventId!, { status: "ended" }),
    onSuccess: async () => {
      // The event drops out of the active list, so clear the selection and let
      // the mount effect fall through to whichever event is now newest.
      setEventId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (eventsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-bone-faint">Loading…</p>
      </div>
    );
  }

  if (!eventsQuery.data || eventsQuery.data.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <h1 className="mb-1 text-2xl font-semibold text-bone">No events yet</h1>
          <p className="mb-4 text-sm text-bone-dim">
            Create one to get a guest link and QR code.
          </p>
          <NewEventForm onCreated={setEventId} autoFocus />
        </div>
      </div>
    );
  }

  const event = eventsQuery.data.find((e) => e.id === eventId) ?? eventsQuery.data[0];
  const requests: QueueRequest[] = queueQuery.data ?? [];
  const playing = requests.filter((r) => r.status === "playing");
  const pending = requests.filter((r) => r.status === "pending");
  const played = requests.filter((r) => r.status === "played");
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
    <div className="mx-auto max-w-6xl px-4 pb-12">
      <EventHeader
        events={eventsQuery.data}
        event={event}
        onSelectEvent={setEventId}
        muted={muted}
        onToggleMute={toggleMute}
        onShowQr={() => setShowQr(true)}
        onRename={(name) => renameMutation.mutate(name)}
        renaming={renameMutation.isPending}
        onTogglePause={() => pauseMutation.mutate(!event.requestsPaused)}
        pausing={pauseMutation.isPending}
        onEnd={() => endMutation.mutate()}
        ending={endMutation.isPending}
      />

      {/* One column on a phone, two from lg up. Now Playing leads on both:
          stacked it is the first thing in view, and side by side it stays put
          while the queue scrolls independently. */}
      <div className="stagger mt-5 grid gap-5 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start">
        <div style={{ "--i": 1 } as CSSProperties} className="lg:sticky lg:top-28">
          <NowPlayingPanel
            playing={playing}
            nextUp={pending[0] ?? null}
            pendingCount={pending.length}
            playedCount={played.length}
            paused={event.requestsPaused}
            busy={statusMutation.isPending}
            onStatusChange={onStatusChange}
          />
        </div>

        <div style={{ "--i": 2 } as CSSProperties}>
          <section>
            <h2 className="mb-3 flex items-baseline gap-2">
              <span className="marquee-label">Up next</span>
              {pending.length > 0 && (
                <span className="nums text-xs text-sodium">{pending.length}</span>
              )}
            </h2>
            {pending.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink-500 p-8 text-center text-sm text-bone-faint">
                No requests waiting. They'll appear here as guests scan the QR code.
              </p>
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
            <details className="mt-4">
              <summary className="marquee-label cursor-pointer py-2">
                Played / dismissed ({done.length})
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
        </div>
      </div>

      {showQr && (
        <QrCard eventName={event.name} publicToken={event.publicToken} onClose={() => setShowQr(false)} />
      )}
    </div>
  );
}
