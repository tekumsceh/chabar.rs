import { query } from "./db.js";
import { isBandLead } from "../shared/roles.js";

const MAX_RESULTS = 40;

/**
 * List / search registered profiles by display name or email.
 * Empty q → browse registered users (so add-member feels populated).
 * Typed q → filter. Later: recommend / local-first when user count grows.
 */
export async function searchUsers(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();

    const bandId = String(req.query.bandId || req.bandId || "").trim();
    if (bandId) {
      const membership = await query(
        `SELECT member_role FROM band_members
         WHERE band_id = :bandId AND user_id = :userId LIMIT 1`,
        { bandId, userId: req.user.id },
      );
      if (!membership.rows[0] || !isBandLead(membership.rows[0].member_role)) {
        return res.status(403).json({
          error: "Forbidden",
          detail: "Samo vlasnik ili lead može tražiti korisnike za bend.",
        });
      }
    }

    const filter = q.length > 0 ? 1 : 0;
    const pattern = filter ? `%${escapeLike(q)}%` : "%";
    const prefix = filter ? `${escapeLike(q)}%` : "%";

    const result = await query(
      `SELECT p.id, p.email, p.display_name, p.created_at
       FROM profiles p
       WHERE p.id <> :selfId
         AND (
           :filter = 0
           OR COALESCE(p.display_name, '') ILIKE :pattern ESCAPE '\\'
           OR COALESCE(p.email, '') ILIKE :pattern ESCAPE '\\'
         )
         AND (
           :bandId = ''
           OR NOT EXISTS (
             SELECT 1 FROM band_members bm
             WHERE bm.band_id = :bandId AND bm.user_id = p.id
           )
         )
       ORDER BY
         CASE
           WHEN :filter = 1 AND COALESCE(p.display_name, '') ILIKE :prefix ESCAPE '\\' THEN 0
           WHEN :filter = 1 AND COALESCE(p.email, '') ILIKE :prefix ESCAPE '\\' THEN 1
           ELSE 2
         END,
         p.created_at DESC NULLS LAST,
         LOWER(COALESCE(NULLIF(TRIM(p.display_name), ''), p.email))
       LIMIT ${MAX_RESULTS}`,
      {
        selfId: req.user.id,
        filter,
        pattern,
        prefix,
        bandId: bandId || "",
      },
    );

    res.json({
      users: result.rows.map((row) => ({
        id: row.id,
        email: row.email || "",
        displayName: row.display_name || row.email?.split("@")[0] || "Korisnik",
      })),
    });
  } catch (error) {
    next(error);
  }
}

function escapeLike(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
