import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QueueRequest } from "../api/client";
import { QueueCard } from "./QueueCard";

interface Props {
  request: QueueRequest;
  onStatusChange: (id: string, status: "playing" | "played" | "dismissed") => void;
  onBlock: (requesterToken: string) => void;
  pending: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function SortableQueueItem({
  request,
  onStatusChange,
  onBlock,
  pending,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: request.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <QueueCard
        request={request}
        onStatusChange={onStatusChange}
        onBlock={onBlock}
        pending={pending}
        reorder={{
          dragHandleRef: setActivatorNodeRef,
          dragAttributes: attributes,
          dragListeners: listeners ?? {},
          onMoveUp,
          onMoveDown,
          canMoveUp,
          canMoveDown,
        }}
      />
    </div>
  );
}
