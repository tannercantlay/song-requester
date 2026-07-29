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
  ApiError,
  blockGuest,
  createEvent,
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

function NewEventForm({
  onCreated,
  onCancel,
  autoFocus,
}: {
  onCreated: (id: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: (eventName: string) => createEvent(eventName),
    onSuccess: async (created) => {
      setName("");
      // Refetch before selecting: the parent picks the event out of the
      // admin-events list, so the new row has to be there first.
      await queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      onCreated(created.id);
    },
  });

  const trimmed = name.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) mutation.mutate(trimmed);
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus={autoFocus}
          value={name}
          onChange={(e) => setName(e.target.value)}
          // Matches the API's createEventSchema: 1-120 characters.
          maxLength={120}
          placeholder="Event name, e.g. Friday at The Anchor"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!trimmed || mutation.isPending}
          className="rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {mutation.isPending ? "Creating…" : "Create event"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-slate-200 px-3 py-2 text-sm font-medium text-slate-600"
          >
            Cancel
          </button>
        )}
      </div>
      {mutation.isError && (
        <p className="text-sm text-rose-600">
          {mutation.error instanceof ApiError ? mutation.error.message : "Could not create the event"}
        </p>
      )}
    </form>
  );
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [eventId, setEventId] = useState<string | null>(null);
  const [muted, setMuted] = useState(isChimeMuted());
  const [showQr, setShowQr] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);

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
    onSuccess: () => {
      setEditingName(false);
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    },
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
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <h1 className="mb-1 text-2xl font-semibold text-slate-900">No events yet</h1>
          <p className="mb-4 text-sm text-slate-500">
            Create one to get a guest link and QR code.
          </p>
          <NewEventForm onCreated={setEventId} autoFocus />
        </div>
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
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (nameDraft.trim()) renameMutation.mutate(nameDraft.trim());
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={120}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xl font-semibold text-slate-900 outline-none focus:border-purple-400"
              />
              <button
                type="submit"
                disabled={renameMutation.isPending}
                className="rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(event?.name ?? "");
                setEditingName(true);
              }}
              className="group flex items-center gap-2 text-left"
              title="Click to rename"
            >
              <h1 className="text-2xl font-semibold text-slate-900">{event?.name ?? "Admin"}</h1>
              <span className="text-sm text-slate-300 group-hover:text-slate-500">✎</span>
            </button>
          )}
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
            <button
              type="button"
              onClick={() => setCreatingEvent(true)}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
            >
              + New event
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
        {creatingEvent && (
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <NewEventForm
              autoFocus
              onCancel={() => setCreatingEvent(false)}
              onCreated={(id) => {
                setCreatingEvent(false);
                setEventId(id);
              }}
            />
          </div>
        )}
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
