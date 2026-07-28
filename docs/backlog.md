# Chabar backlog (living notes)

## Uskoro / stubs in UI

- ~~Chat (footer)~~ — removed from nav (placeholder file may remain)
- ~~Tactile quick-add termin~~ — calendar + LED bands + city chips (done)
- Event → Tehnički / Show
- Band → Mediji / Obaveštenja / Podešavanja benda
- Settings → invite digest (“Dnevni pregled”)
- User menu → Nalog
- Legal copy (terms / privacy)

## Planned / not built

- Wire (or hide) global top search
- Per-member default fee storage + settings
- **Website admin area** (web roles `admin` / `superadmin`; gate UI + API)
  - **Web admins must use Google** (or have Google linked on the Supabase Auth user) before admin access / durable grants
  - When inviting/promoting a web admin, show whether the target is email/password-only vs has Google attached
- Band home redesign (less calendar-heavy)
- Remove orphan `BandTiles.jsx`

## Finish / ship

- Notifications on live (deploy + migration `014` + VAPID) if not already
- PWA smoke on live
- Bundle / npm audit cleanup
