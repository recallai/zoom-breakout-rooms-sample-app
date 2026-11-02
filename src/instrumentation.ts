/**
 * Runs once when the Next.js server starts: apply any pending database migrations from ./drizzle.
 * https://nextjs.org/docs/app/guides/instrumentation
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const { migrate } = await import("drizzle-orm/libsql/migrator");
    const { db } = await import("@/db");
    await migrate(db, { migrationsFolder: "./drizzle" });
}
