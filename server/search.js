import { query } from "./db.js";

const MAX_PER_KIND = 6;

/** Events visible to user (same rules as schedule list). */
const EVENT_ACCESS_SQL = `
  FROM events e
  JOIN bands b ON b.id = e.band_id
  JOIN band_members bm ON bm.band_id = e.band_id AND bm.user_id = :userId
  WHERE (
    bm.member_role IS DISTINCT FROM 'saradnik'
    OR EXISTS (
      SELECT 1 FROM event_assignees ea
      WHERE ea.event_id = e.id AND ea.user_id = :userId
    )
  )
`;

function escapeLike(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function eventLabel(row) {
  const date = String(row.event_date_text || "").replace(/\.$/, "");
  const city = String(row.city || "").trim();
  const venue = String(row.venue || "").trim();
  const place = [city, venue].filter(Boolean).join(" · ");
  return place ? `${date} — ${place}` : date || "Termin";
}

/**
 * Global autocomplete: events, cities, venues, bands, co-members.
 * GET /api/search?q=...
 */
export async function globalSearch(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 1) {
      return res.json({ results: [] });
    }

    const userId = req.user.id;
    const pattern = `%${escapeLike(q)}%`;
    const prefix = `${escapeLike(q)}%`;

    const [events, cities, venues, bands, users] = await Promise.all([
      query(
        `SELECT e.id, e.band_id, e.event_date_text, e.city, e.venue, e.note, b.name AS band_name
         ${EVENT_ACCESS_SQL}
           AND (
             COALESCE(e.event_date_text, '') ILIKE :pattern ESCAPE '\\'
             OR COALESCE(e.city, '') ILIKE :pattern ESCAPE '\\'
             OR COALESCE(e.venue, '') ILIKE :pattern ESCAPE '\\'
             OR COALESCE(e.note, '') ILIKE :pattern ESCAPE '\\'
             OR COALESCE(b.name, '') ILIKE :pattern ESCAPE '\\'
           )
         ORDER BY
           CASE WHEN COALESCE(e.event_date_text, '') ILIKE :prefix ESCAPE '\\' THEN 0 ELSE 1 END,
           e.sort_order, e.id DESC
         LIMIT ${MAX_PER_KIND}`,
        { userId, pattern, prefix },
      ),
      query(
        `SELECT e.city AS label, COUNT(*)::int AS count
         ${EVENT_ACCESS_SQL}
           AND NULLIF(trim(e.city), '') IS NOT NULL
           AND e.city ILIKE :pattern ESCAPE '\\'
         GROUP BY e.city
         ORDER BY
           CASE WHEN e.city ILIKE :prefix ESCAPE '\\' THEN 0 ELSE 1 END,
           COUNT(*) DESC,
           e.city
         LIMIT ${MAX_PER_KIND}`,
        { userId, pattern, prefix },
      ),
      query(
        `SELECT e.venue AS label, COUNT(*)::int AS count
         ${EVENT_ACCESS_SQL}
           AND NULLIF(trim(e.venue), '') IS NOT NULL
           AND e.venue ILIKE :pattern ESCAPE '\\'
         GROUP BY e.venue
         ORDER BY
           CASE WHEN e.venue ILIKE :prefix ESCAPE '\\' THEN 0 ELSE 1 END,
           COUNT(*) DESC,
           e.venue
         LIMIT ${MAX_PER_KIND}`,
        { userId, pattern, prefix },
      ),
      query(
        `SELECT b.id, b.name, b.kind
         FROM bands b
         JOIN band_members bm ON bm.band_id = b.id AND bm.user_id = :userId
         WHERE b.name ILIKE :pattern ESCAPE '\\'
         ORDER BY
           CASE WHEN b.name ILIKE :prefix ESCAPE '\\' THEN 0 ELSE 1 END,
           b.name
         LIMIT ${MAX_PER_KIND}`,
        { userId, pattern, prefix },
      ),
      query(
        `SELECT DISTINCT ON (p.id)
            p.id,
            COALESCE(NULLIF(trim(p.display_name), ''), split_part(p.email, '@', 1), 'Korisnik') AS label,
            p.email,
            b.name AS band_name
         FROM band_members bm_self
         JOIN band_members bm_other ON bm_other.band_id = bm_self.band_id
         JOIN profiles p ON p.id = bm_other.user_id
         JOIN bands b ON b.id = bm_self.band_id
         WHERE bm_self.user_id = :userId
           AND bm_other.user_id <> :userId
           AND (
             COALESCE(p.display_name, '') ILIKE :pattern ESCAPE '\\'
             OR COALESCE(p.email, '') ILIKE :pattern ESCAPE '\\'
           )
         ORDER BY p.id,
           CASE WHEN COALESCE(p.display_name, '') ILIKE :prefix ESCAPE '\\' THEN 0 ELSE 1 END,
           label
         LIMIT ${MAX_PER_KIND}`,
        { userId, pattern, prefix },
      ),
    ]);

    const results = [];
    const seen = new Set();

    function push(item) {
      const key = `${item.kind}:${item.id || item.label}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push(item);
    }

    for (const row of events.rows) {
      push({
        kind: "event",
        id: row.id,
        bandId: row.band_id,
        label: eventLabel(row),
        hint: row.band_name || "",
        filterText: [row.city, row.venue, row.note, row.event_date_text].filter(Boolean).join(" "),
        category: "Termin",
      });
    }

    for (const row of cities.rows) {
      push({
        kind: "city",
        label: row.label,
        hint: `${row.count} ${row.count === 1 ? "termin" : "termina"}`,
        filterText: row.label,
        category: "Grad",
      });
    }

    for (const row of venues.rows) {
      push({
        kind: "venue",
        label: row.label,
        hint: `${row.count} ${row.count === 1 ? "termin" : "termina"}`,
        filterText: row.label,
        category: "Lokal",
      });
    }

    for (const row of bands.rows) {
      const label = row.kind === "personal" ? `${row.name} (lično)` : row.name;
      push({
        kind: "band",
        id: row.id,
        bandId: row.id,
        label,
        hint: row.kind === "personal" ? "Lični bend" : "Bend",
        filterText: row.name,
        category: "Bend",
      });
    }

    for (const row of users.rows) {
      push({
        kind: "user",
        id: row.id,
        label: row.label,
        hint: row.band_name || row.email || "",
        filterText: row.label,
        category: "Korisnik",
      });
    }

    res.json({ results: results.slice(0, 20) });
  } catch (error) {
    next(error);
  }
}
