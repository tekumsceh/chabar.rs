# Google Calendar sync — Chabar

Ovaj dokument objašnjava kako sync radi, kako ga uključiti/isključiti, i šta očekivati. Čitaj pre povezivanja benda.

## Ukratko (bez straha)

1. **Prijava Google-om** ≠ **Calendar sync**. Sync traži posebnu dozvolu.
2. **Po bendu** biraš **jedan** Google kalendar (npr. „Saint Louis” → taj privatni kalendar).
3. **Podrazumevano** Chabar **samo šalje** termine u Google (i ažurira one koje je već povezao). **Ne uvozi** staru istoriju dok ti eksplicitno ne kažeš.
4. **Lični sync po bendu** (Bend → Podešavanja) piše **u tvoj** izabrani kalendar za taj bend — **pored** zajedničkog band kalendara, ne umesto njega.
5. Drugi članovi benda **ne dobijaju** automatski kopije u svoje Google kalendare (samo ako sami uključe lični sync).

## Ko može šta (v1)

| Akcija | Ko |
| --- | --- |
| Poveži Google nalog (Settings) | Svaki korisnik za sebe |
| Prvo poveži kalendar na bend | Owner ili lead |
| Sync on/off, odveži, pull/uvoz, push, obriši uvezeno | Samo connector (ko je povezao kalendar) |
| Kasnije | Owner + lead mogu preuzeti link |

Google opis događaja sadrži grad/lokal/napomenu + `created via chabar.rs` — **bez** cene/prevoza (finansije ostaju u Chabar-u).

## Preporučeni redosled

1. Podešavanja → **Poveži Google kalendar** (jednom).
2. Bend Marko Louis → swipe → **Izaberi kalendar** → tvoj Marko Louis kalendar.
3. Bend Saint Louis → isto → Saint Louis kalendar.
4. Dodaj/izmeni termin u Chabar-u → pojavi se u tom Google kalendaru (bez duplikata; isti Chabar id = update).
5. Dugme **Pošalji u Google** — Chabar → Google: dodaje termine koji još nisu u povezanom kalendaru (sa linijom `created via chabar.rs`).
6. Dugme **Ažuriraj povezane** — bezbedno, ne pravi nove Chabar redove.
7. Dugme **Uvezi buduće iz Google-a** — samo ako želiš da postojeći **budući** Google datumi uđu u Chabar (sa potvrdom). Prošlost se ne dira; isti datum se ne duplira.
8. Dugme **Obriši uvezeno** — briše samo Chabar redove sa `sync_source=google` (test/cleanup). **Google kalendar ostaje netaknut.**

## Šta sprečava duplikate

- Svaki Google događaj koji je Chabar napravio ima privatni tag `chabarEventId`.
- Pre novog POST-a Chabar traži taj tag — ako postoji, radi UPDATE.
- Band kalendar i lični sync po bendu mogu raditi **istovremeno** (zajednički + tvoja kopija).
- Lični sync = samo korisnik koji je sačuvao termin, ne svi članovi.
- Uvoz: match po `google_event_id`, pa po istom datumu (+ sličan naziv) pre INSERT-a.
- Uvoz samo od **danas** nadalje.

## Lični sync po bendu

- Uključi u **Bend → Podešavanja → Moj lični kalendar** za svaki bend posebno.
- Radi i kada bend već ima zajednički Google kalendar.
- Piše u **tvoj** izabrani kalendar samo za termine koje **ti** dodaš ili izmeniš.
- Ne šalje se drugim članovima.

## Uključivanje / isključivanje

**Trenutno isključeno na produkciji** — sync radi samo kada je na serveru `GOOGLE_CALENDAR_SYNC_ENABLED=1` i OAuth env vars postavljeni. UI je sakriven dok flag nije uključen u kodu (`src/featureFlags.js`).

- **Isključi sync** na bendu = prestaje pisanje u Google; link ostaje.
- **Odveži kalendar** = briše link; Google eventi ostaju u Google-u.
- **Odveži nalog** u Podešavanjima = briše tokene.

## Konflikti

- Poslednji uspešan upis pobeđuje.
- Brisanje u Chabar-u pokušava brisanje u band Google kalendaru.
- Brisanje u Google-u **ne briše** Chabar termine sa finansijama.

## OAuth scopes

- `calendar.events` — eventi  
- `calendar.readonly` — lista kalendara  

Ako vidiš **insufficient scopes**: odveži, dodaj oba scope-a u Google Data Access, poveži ponovo.

## Lokal vs live

Isti OAuth klijent, oba redirect URI:

- `http://localhost:3001/api/google/calendar/callback`
- `https://chabar.rs/api/google/calendar/callback`

`.env` po okruženju: `GOOGLE_CALENDAR_*` + `PUBLIC_APP_URL`.

## FAQ

**Imam već pune Google kalendare — hoće li Chabar da ih usisa?**  
Ne, dok ne klikneš **Uvezi buduće**. Link + outbound sync su dovoljni za većinu.

**Hoće li drugi članovi dobiti termine u svoje Google-e?**  
Ne. Samo band kalendar (koji si ti povezao) ili tvoj lični sync.

**Duplikati u Google-u?**  
Ne bi trebalo — isti Chabar termin se UPDATE-uje. Ako vidiš duplikat, javi (tag / stari event bez taga).
