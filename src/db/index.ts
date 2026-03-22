import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let db: NeonHttpDatabase<typeof schema>;

export function getDb() {
  if (!db) {
    const sql = neon(process.env.DATABASE_URL!);
    db = drizzle(sql, { schema });
  }
  return db;
}
