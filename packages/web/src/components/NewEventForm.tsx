import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, createEvent } from "../api/client";

interface Props {
  onCreated: (id: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function NewEventForm({ onCreated, onCancel, autoFocus }: Props) {
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
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus={autoFocus}
          value={name}
          onChange={(e) => setName(e.target.value)}
          // Matches the API's createEventSchema: 1-120 characters.
          maxLength={120}
          placeholder="Event name, e.g. Friday at The Anchor"
          className="h-11 min-w-0 flex-1 rounded-lg border border-ink-500 px-3 text-sm"
        />
        <button
          type="submit"
          disabled={!trimmed || mutation.isPending}
          className="h-11 rounded-full bg-sodium px-5 text-sm font-medium text-ink-900 disabled:opacity-50"
        >
          {mutation.isPending ? "Creating…" : "Create event"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-full bg-ink-500 px-4 text-sm font-medium text-bone-dim"
          >
            Cancel
          </button>
        )}
      </div>
      {mutation.isError && (
        <p className="text-sm text-ember">
          {mutation.error instanceof ApiError ? mutation.error.message : "Could not create the event"}
        </p>
      )}
    </form>
  );
}
