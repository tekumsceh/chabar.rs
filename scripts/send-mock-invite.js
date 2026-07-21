import "dotenv/config";
import { query } from "../server/db.js";

const TARGET = "tekumsceh@gmail.com";

const profiles = await query(
  `SELECT id, email, display_name FROM profiles ORDER BY email`,
);
console.log(
  "profiles:",
  profiles.rows.map((r) => `${r.email} (${r.display_name})`),
);

const me = profiles.rows.find((r) => String(r.email).toLowerCase() === TARGET);
if (!me) {
  console.error("Target profile not found");
  process.exit(1);
}

const other =
  profiles.rows.find((r) => String(r.email).toLowerCase() !== TARGET) || me;

// Throwaway demo band (not owned by target, so Accept works cleanly)
const color = "#c45c26";
const band = await query(
  `INSERT INTO bands (name, kind, color)
   VALUES ('Demo pozivnica', 'group', :color)
   RETURNING id, name, color`,
  { color },
);
const bandId = band.rows[0].id;

await query(
  `INSERT INTO band_members (band_id, user_id, member_role, can_invite)
   VALUES (:bandId, :userId, 'owner', TRUE)`,
  { bandId, userId: other.id },
);

const invite = await query(
  `INSERT INTO band_invites (band_id, email, member_role, invited_by)
   VALUES (:bandId, :email, 'member', :invitedBy)
   RETURNING id, email, created_at`,
  {
    bandId,
    email: TARGET,
    invitedBy: other.id,
  },
);

console.log(
  JSON.stringify(
    {
      band: band.rows[0],
      invite: invite.rows[0],
      invitedBy: other.email,
      note: "Refresh app / open avatar menu → Pozivnice",
    },
    null,
    2,
  ),
);

process.exit(0);
