import "dotenv/config";
import { syncMissingProfilesFromAuth } from "../server/auth.js";
import { pool } from "../server/db.js";

const result = await syncMissingProfilesFromAuth();
console.log(`Synced ${result.created.length} account(s).`);
for (const row of result.created) {
  console.log(`- ${row.email} (${row.displayName})`);
}
await pool.end();
