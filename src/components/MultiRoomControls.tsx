"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { queue_rooms_action, resume_dispatch_action } from "@/app/action";
import { Button } from "@/components/ui/Button";
import type { BotType } from "@/db/schema";

export function MultiRoomControls({
  meetingId,
  rooms,
  disabled,
  bots,
}: {
  meetingId: string;
  rooms: { id: string; name: string }[];
  disabled: boolean;
  bots: BotType[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const validSelection = selected.filter((id) => rooms.some((room) => room.id === id));
  const counts = {
    queued: bots.filter((bot) => bot.status === "queued").length,
    joining: bots.filter(
      (bot) =>
        bot.active &&
        !bot.location_id &&
        !["queued", "creation_unknown", "leaving"].includes(bot.status),
    ).length,
    inRoom: bots.filter((bot) => bot.active && bot.location_id === bot.room_id).length,
    failed: bots.filter((bot) => ["create_failed", "fatal"].includes(bot.status)).length,
    uncertain: bots.filter((bot) => bot.status === "creation_unknown").length,
  };
  function send(ids: string[]) {
    startTransition(async () => {
      try {
        const result = await queue_rooms_action(meetingId, ids);
        if (result.error) toast.error(result.error);
        else {
          toast.success(
            `${result.queued} room bots queued${result.skipped ? `; ${result.skipped} already reserved` : ""}`,
          );
          setSelected([]);
        }
      } catch {
        toast.error(
          "Connection lost. Refresh to check existing reservations before sending again.",
        );
      }
    });
  }
  return (
    <div className="grid gap-3 rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">
        Room bots: {counts.queued} queued · {counts.joining} joining / awaiting entry ·{" "}
        {counts.inRoom} in room · {counts.failed} failed · {counts.uncertain} creation uncertain
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={disabled || pending || !rooms.length}
          onClick={() => send(rooms.map((room) => room.id))}
        >
          Send to all open rooms ({rooms.length})
        </Button>
        <Button
          variant="outline"
          disabled={disabled || pending || !validSelection.length}
          onClick={() => send(validSelection)}
        >
          Send selected ({validSelection.length})
        </Button>
        {counts.queued > 0 && (
          <Button
            variant="outline"
            disabled={disabled || pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await resume_dispatch_action();
                  if (result.error) toast.error(result.error);
                  else toast.success("Dispatch queue resumed");
                } catch {
                  toast.error("Couldn't resume dispatch");
                }
              })
            }
          >
            Resume queued dispatches
          </Button>
        )}
        {pending && (
          <span role="status" className="text-xs">
            Queuing…
          </span>
        )}
      </div>
      {rooms.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs">Choose rooms</summary>
          <div className="mt-2 flex flex-wrap gap-4">
            {rooms.map((room) => (
              <label key={room.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={disabled || pending}
                  checked={validSelection.includes(room.id)}
                  onChange={(event) =>
                    setSelected((ids) =>
                      event.target.checked ? [...ids, room.id] : ids.filter((id) => id !== room.id),
                    )
                  }
                />
                {room.name}{" "}
                <span className="text-xs text-muted-foreground">({room.id.slice(0, 8)})</span>
              </label>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
