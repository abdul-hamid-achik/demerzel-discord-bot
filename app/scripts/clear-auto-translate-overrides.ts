import { neon } from "@neondatabase/serverless";
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(scriptDir, "../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(databaseUrl);
const deleted = await sql`
  delete from channel_settings
  where auto_translate = true
  returning channel_id
`;

console.log(`Deleted ${deleted.length} enabled auto-translate override row(s).`);
