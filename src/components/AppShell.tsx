import { ChevronRightIcon, NetworkIcon } from "lucide-react";
import Link from "next/link";
import { RefreshButton } from "@/components/RefreshButton";

export function AppShell({
  children,
  crumbs = [],
}: {
  children: React.ReactNode;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <NetworkIcon className="size-5" />
            </span>
            Zoom Breakout Rooms
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">Updates every 5s</span>
            <RefreshButton checkedAt={Date.now()} />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-7 px-5 py-8 sm:px-8 sm:py-10">
        {crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link className="hover:text-primary" href="/">
              Meetings
            </Link>
            {crumbs.map((crumb) => (
              <span className="flex items-center gap-2" key={crumb.href ?? crumb.label}>
                <ChevronRightIcon className="size-3" />
                {crumb.href ? (
                  <Link className="hover:text-primary" href={crumb.href}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-foreground">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
        {children}
      </main>
    </div>
  );
}
