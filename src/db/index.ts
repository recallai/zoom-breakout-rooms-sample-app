import { mkdirSync } from "node:fs";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/** Local SQLite file. Override with DATABASE_URL, e.g. "file:./data/other.db". */
const DATABASE_URL = process.env.DATABASE_URL ?? "file:./data/app.db";

function create_db_client(): Client {
  if (DATABASE_URL.startsWith("file:")) {
    mkdirSync(path.dirname(DATABASE_URL.slice("file:".length)), { recursive: true });
  }
  return createClient({ url: DATABASE_URL });
}

// Reuse one client across hot reloads in development.
const global_for_db = globalThis as unknown as { db_client?: Client };
global_for_db.db_client ??= create_db_client();
const client = global_for_db.db_client;

export const db = drizzle(client, { schema });
