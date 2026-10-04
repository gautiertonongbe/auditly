import { eq } from "drizzle-orm";
import type { AnyMySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../drizzle/schema";

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("tidbcloud") ? { rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
});
export const db = drizzle(pool, { schema, mode: "default" });
export type DB = typeof db;

/**
 * MySQL has no INSERT ... RETURNING, so insert the row and read it back by id.
 * Returns a one-element array to match Drizzle's `.returning()` shape.
 */
export async function insertReturning<T extends MySqlTable & { id: AnyMySqlColumn }>(
  database: DB,
  table: T,
  values: T["$inferInsert"] & { id: string },
): Promise<T["$inferSelect"][]> {
  await database.insert(table).values(values);
  return (await database.select().from(table as any).where(eq(table.id, values.id)).limit(1)) as T["$inferSelect"][];
}
