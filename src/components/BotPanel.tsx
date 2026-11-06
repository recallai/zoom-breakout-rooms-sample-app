import type { ReactNode } from "react";
import { BotConfiguration } from "@/components/BotConfiguration";
import { CaptureRefreshControl, CaptureResults } from "@/components/CaptureResults";
import { ClientTime } from "@/components/ClientTime";
import { BotStatus } from "@/components/MeetingViews";
import type { BotType, CaptureRowType } from "@/db/schema";

/** Common bot summary; callers supply the heading and any meeting or room details. */
export function BotPanel({
  bot,
  rows,
  transcribe,
  heading,
  children,
}: {
  bot: BotType;
  rows: CaptureRowType[];
  transcribe: boolean;
  heading: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          {heading}
          <span className="text-xs text-muted-foreground">
            Dispatched <ClientTime value={bot.created_at} />
          </span>
        </div>
        <div className="ml-auto">
          <CaptureRefreshControl bot={bot} rows={rows} />
        </div>
      </div>
      <BotStatus bot={bot} />
      <CaptureResults bot={bot} rows={rows} transcribe={transcribe} />
      <BotConfiguration bot={bot} />
      {children}
    </>
  );
}
