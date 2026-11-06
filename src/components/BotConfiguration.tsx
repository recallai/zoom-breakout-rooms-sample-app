import type { BotType } from "@/db/schema";

export function BotConfiguration({ bot }: { bot: BotType }) {
  return (
    <details className="rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">Bot configuration</summary>
      {bot.create_payload ? (
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(JSON.parse(bot.create_payload), null, 2)}
        </pre>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Configuration was not saved for this older bot.
        </p>
      )}
    </details>
  );
}
