# UI Texts — Chabar

Editable catalog of **all system / UI copy** (labels, buttons, toasts, confirms, errors, aria, placeholders).
**Not included:** database content (band names, cities, venues, notes, amounts, user names/emails).

## How to use

1. Edit only the `TEXT:` line under an entry (keep `KEY:` / `FILE:` / `KIND:` intact).
2. For dynamic bits use `{name}`, `{date}`, `{city}`, etc. — same placeholders the code already interpolates.
3. Save this file.
4. Tell the agent: **apply UI texts** (or “apply UI_TEXTS.md”).
5. The agent will copy each changed `TEXT` into the listed `FILE` (and related duplicates if any).

Regenerate this catalog from code (overwrites): `node scripts/build-ui-texts.js`

---

Generated: 2026-07-21 · 461 entries


## App

### App.aria.glavna_navigacija
- KEY: App.aria.glavna_navigacija
- FILE: src/App.jsx
- KIND: aria
- TEXT: Glavna navigacija

### App.nav.report
- KEY: App.nav.report
- FILE: src/App.jsx
- KIND: label
- TEXT: Finansije

### App.nav.schedule
- KEY: App.nav.schedule
- FILE: src/App.jsx
- KIND: label
- TEXT: Raspored

### App.text.ucitavanje
- KEY: App.text.ucitavanje
- FILE: src/App.jsx
- KIND: label
- TEXT: Učitavanje

### App.toast.created_city
- KEY: App.toast.created_city
- FILE: src/App.jsx
- KIND: toast
- TEXT: — {city}

### App.toast.google_kalendar_povezan
- KEY: App.toast.google_kalendar_povezan
- FILE: src/App.jsx
- KIND: toast
- TEXT: Google kalendar povezan

### App.toast.json_kopiran_u_clipboard
- KEY: App.toast.json_kopiran_u_clipboard
- FILE: src/App.jsx
- KIND: toast
- TEXT: JSON kopiran u clipboard

### App.toast.kurs_nije_dostupan
- KEY: App.toast.kurs_nije_dostupan
- FILE: src/App.jsx
- KIND: toast
- TEXT: Kurs nije dostupan

### App.toast.kurs_rate_label
- KEY: App.toast.kurs_rate_label
- FILE: src/App.jsx
- KIND: toast (approx template)
- TEXT: Kurs: {rate} ({label}{asOf})

### App.toast.label
- KEY: App.toast.label
- FILE: src/App.jsx
- KIND: toast
- TEXT: : {label}

### App.toast.moras_izabrati_bend_ili_personal
- KEY: App.toast.moras_izabrati_bend_ili_personal
- FILE: src/App.jsx
- KIND: toast
- TEXT: Moraš izabrati bend ili Lično

### App.toast.nextevent_city
- KEY: App.toast.nextevent_city
- FILE: src/App.jsx
- KIND: toast
- TEXT: — {city}

### App.toast.odbijanje_nije_uspelo
- KEY: App.toast.odbijanje_nije_uspelo
- FILE: src/App.jsx
- KIND: toast
- TEXT: Odbijanje nije uspelo

### App.toast.pozivnica_odbijena
- KEY: App.toast.pozivnica_odbijena
- FILE: src/App.jsx
- KIND: toast
- TEXT: Pozivnica odbijena

### App.toast.pridruzio_la_si_se_result_band_name_bend
- KEY: App.toast.pridruzio_la_si_se_result_band_name_bend
- FILE: src/App.jsx
- KIND: toast
- TEXT: Pridružio/la si se: {bend}

### App.toast.prihvatanje_nije_uspelo
- KEY: App.toast.prihvatanje_nije_uspelo
- FILE: src/App.jsx
- KIND: toast
- TEXT: Prihvatanje nije uspelo

### App.toast.prosli_termini_se_ne_mogu_brisati
- KEY: App.toast.prosli_termini_se_ne_mogu_brisati
- FILE: src/App.jsx
- KIND: toast
- TEXT: Prošli termini se ne mogu brisati

### App.toast.result_asof
- KEY: App.toast.result_asof
- FILE: src/App.jsx
- KIND: toast
- TEXT: , {asOf}

### App.toast.sacuvano
- KEY: App.toast.sacuvano
- FILE: src/App.jsx
- KIND: toast
- TEXT: Sačuvano

### App.toast.termin_dodat
- KEY: App.toast.termin_dodat
- FILE: src/App.jsx
- KIND: toast
- TEXT: Termin dodat: {date}{city}

### App.toast.termin_obrisan
- KEY: App.toast.termin_obrisan
- FILE: src/App.jsx
- KIND: toast
- TEXT: Termin obrisan{label}

### App.toast.unesi_eur_ili_din_iznos
- KEY: App.toast.unesi_eur_ili_din_iznos
- FILE: src/App.jsx
- KIND: toast
- TEXT: Unesi EUR ili DIN iznos

### App.toast.uplata_dodata
- KEY: App.toast.uplata_dodata
- FILE: src/App.jsx
- KIND: toast
- TEXT: Uplata dodata


## BandPage

### BandPage.aria.alati_benda
- KEY: BandPage.aria.alati_benda
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Alati benda

### BandPage.aria.kalendar_benda
- KEY: BandPage.aria.kalendar_benda
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Kalendar benda

### BandPage.aria.nazad_na_raspored
- KEY: BandPage.aria.nazad_na_raspored
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Nazad na raspored

### BandPage.aria.otvori_info_benda
- KEY: BandPage.aria.otvori_info_benda
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Otvori info benda

### BandPage.aria.pozovi_clana
- KEY: BandPage.aria.pozovi_clana
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Pozovi člana

### BandPage.aria.prethodni_mesec
- KEY: BandPage.aria.prethodni_mesec
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Prethodni mesec

### BandPage.aria.registrovani_korisnici
- KEY: BandPage.aria.registrovani_korisnici
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Registrovani korisnici

### BandPage.aria.sledeci_mesec
- KEY: BandPage.aria.sledeci_mesec
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Sledeći mesec

### BandPage.aria.ukloni_clana
- KEY: BandPage.aria.ukloni_clana
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Ukloni člana

### BandPage.aria.ukloni_clana_2
- KEY: BandPage.aria.ukloni_clana_2
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Ukloni člana

### BandPage.aria.uloge_clanova
- KEY: BandPage.aria.uloge_clanova
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Uloge članova

### BandPage.aria.uloge_i_pozivnice
- KEY: BandPage.aria.uloge_i_pozivnice
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Uloge i pozivnice

### BandPage.aria.vise_o_bendu
- KEY: BandPage.aria.vise_o_bendu
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Više o bendu

### BandPage.aria.vlasnistvo_benda
- KEY: BandPage.aria.vlasnistvo_benda
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Vlasništvo benda

### BandPage.aria.vlasnistvo_benda_2
- KEY: BandPage.aria.vlasnistvo_benda_2
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Vlasništvo benda

### BandPage.aria.zatvori
- KEY: BandPage.aria.zatvori
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Zatvori

### BandPage.aria.zatvori_panel
- KEY: BandPage.aria.zatvori_panel
- FILE: src/BandPage.jsx
- KIND: aria
- TEXT: Zatvori panel

### BandPage.confirm.cancelLabel.otkazi
- KEY: BandPage.confirm.cancelLabel.otkazi
- FILE: src/BandPage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### BandPage.confirm.cancelLabel.otkazi_2
- KEY: BandPage.confirm.cancelLabel.otkazi_2
- FILE: src/BandPage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### BandPage.confirm.cancelLabel.otkazi_3
- KEY: BandPage.confirm.cancelLabel.otkazi_3
- FILE: src/BandPage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### BandPage.confirm.cancelLabel.otkazi_4
- KEY: BandPage.confirm.cancelLabel.otkazi_4
- FILE: src/BandPage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### BandPage.confirm.cancelLabel.otkazi_5
- KEY: BandPage.confirm.cancelLabel.otkazi_5
- FILE: src/BandPage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### BandPage.confirm.cancelLabel.otkazi_6
- KEY: BandPage.confirm.cancelLabel.otkazi_6
- FILE: src/BandPage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### BandPage.confirm.cancelLabel.otkazi_7
- KEY: BandPage.confirm.cancelLabel.otkazi_7
- FILE: src/BandPage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### BandPage.confirm.confirmLabel.obrisi
- KEY: BandPage.confirm.confirmLabel.obrisi
- FILE: src/BandPage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Obriši

### BandPage.confirm.confirmLabel.obrisi_bend
- KEY: BandPage.confirm.confirmLabel.obrisi_bend
- FILE: src/BandPage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Obriši bend

### BandPage.confirm.confirmLabel.odvezi
- KEY: BandPage.confirm.confirmLabel.odvezi
- FILE: src/BandPage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Odveži

### BandPage.confirm.confirmLabel.posalji
- KEY: BandPage.confirm.confirmLabel.posalji
- FILE: src/BandPage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Pošalji

### BandPage.confirm.confirmLabel.prenesi
- KEY: BandPage.confirm.confirmLabel.prenesi
- FILE: src/BandPage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Prenesi

### BandPage.confirm.confirmLabel.ukloni
- KEY: BandPage.confirm.confirmLabel.ukloni
- FILE: src/BandPage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Ukloni

### BandPage.confirm.confirmLabel.uvezi
- KEY: BandPage.confirm.confirmLabel.uvezi
- FILE: src/BandPage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Uvezi

### BandPage.confirm.message.member_name_ce_biti_uklonjen_a_iz_benda
- KEY: BandPage.confirm.message.member_name_ce_biti_uklonjen_a_iz_benda
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: {name} će biti uklonjen/a iz benda.

### BandPage.confirm.message.obrisati_n_termin_a_uvezena_iz_google_a_iz_chaba
- KEY: BandPage.confirm.message.obrisati_n_termin_a_uvezena_iz_google_a_iz_chaba
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: Obrisati {n} termin(a) uvezena iz Google-a iz Chabar-a?\n\n

### BandPage.confirm.message.obrisati_n_termin_a_uvezena_iz_google_a_iz_chaba_2
- KEY: BandPage.confirm.message.obrisati_n_termin_a_uvezena_iz_google_a_iz_chaba_2
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: Obrisati {n} termin(a) uvezena iz Google-a iz Chabar-a?\n\nGoogle kalendar ostaje netaknut — briše se samo kopija u aplikaciji.

### BandPage.confirm.message.odvezati_google_kalendar_od_ovog_benda
- KEY: BandPage.confirm.message.odvezati_google_kalendar_od_ovog_benda
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: Odvezati Google kalendar od ovog benda?

### BandPage.confirm.message.poslati_chabar_datume_koji_jos_nisu_u_google_kal
- KEY: BandPage.confirm.message.poslati_chabar_datume_koji_jos_nisu_u_google_kal
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: Poslati Chabar datume koji još nisu u Google kalendaru?\n\n

### BandPage.confirm.message.poslati_chabar_datume_koji_jos_nisu_u_google_kal_2
- KEY: BandPage.confirm.message.poslati_chabar_datume_koji_jos_nisu_u_google_kal_2
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: Poslati Chabar datume koji još nisu u Google kalendaru?\n\n• Samo Kalendar za ovaj bend\n• Ne dira postojeće Google događaje\n• Dodati termini su označeni sa: „created via chabar.rs”

### BandPage.confirm.message.preneti_vlasnistvo_na_member_name_nti_postajes_l
- KEY: BandPage.confirm.message.preneti_vlasnistvo_na_member_name_nti_postajes_l
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: Preneti vlasništvo na {name}?\nTi postaješ lead. Ovo ne možeš poništiti sam/a.

### BandPage.confirm.message.trajno_obrisati_bend_name_ntermini_i_clanstva_ne
- KEY: BandPage.confirm.message.trajno_obrisati_bend_name_ntermini_i_clanstva_ne
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: Trajno obrisati bend „{name}“?\nTermini i članstva nestaju. Nema povratka.

### BandPage.confirm.message.uvesti_buduce_datume_iz_google_kalendara_koji_jo
- KEY: BandPage.confirm.message.uvesti_buduce_datume_iz_google_kalendara_koji_jo
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: Uvesti BUDUĆE datume iz Google kalendara koji još nisu u Chabar-u?\n\n

### BandPage.confirm.message.uvesti_buduce_datume_iz_google_kalendara_koji_jo_2
- KEY: BandPage.confirm.message.uvesti_buduce_datume_iz_google_kalendara_koji_jo_2
- FILE: src/BandPage.jsx
- KIND: confirm (message)
- TEXT: Uvesti BUDUĆE datume iz Google kalendara koji još nisu u Chabar-u?\n\n• Ne dira prošlost\n• Ne pravi duplikate ako isti datum već postoji\n• Ne piše u kalendare drugih članova\n\nPreporuka: prvo koristi „Ažuriraj povezane”.

### BandPage.confirm.title.obrisati_bend
- KEY: BandPage.confirm.title.obrisati_bend
- FILE: src/BandPage.jsx
- KIND: confirm (title)
- TEXT: Obrisati bend?

### BandPage.confirm.title.obrisi_uvezeno
- KEY: BandPage.confirm.title.obrisi_uvezeno
- FILE: src/BandPage.jsx
- KIND: confirm (title)
- TEXT: Obriši uvezeno?

### BandPage.confirm.title.odvezati_kalendar
- KEY: BandPage.confirm.title.odvezati_kalendar
- FILE: src/BandPage.jsx
- KIND: confirm (title)
- TEXT: Odvezati kalendar?

### BandPage.confirm.title.posalji_u_google
- KEY: BandPage.confirm.title.posalji_u_google
- FILE: src/BandPage.jsx
- KIND: confirm (title)
- TEXT: Pošalji u Google?

### BandPage.confirm.title.preneti_vlasnistvo
- KEY: BandPage.confirm.title.preneti_vlasnistvo
- FILE: src/BandPage.jsx
- KIND: confirm (title)
- TEXT: Preneti vlasništvo?

### BandPage.confirm.title.ukloniti_clana
- KEY: BandPage.confirm.title.ukloniti_clana
- FILE: src/BandPage.jsx
- KIND: confirm (title)
- TEXT: Ukloniti člana?

### BandPage.confirm.title.uvesti_iz_google_a
- KEY: BandPage.confirm.title.uvesti_iz_google_a
- FILE: src/BandPage.jsx
- KIND: confirm (title)
- TEXT: Uvesti iz Google-a?

### BandPage.note.bend_kalendar
- KEY: BandPage.note.bend_kalendar
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: bend kalendar

### BandPage.note.bez_novih_termina_bezbedno
- KEY: BandPage.note.bez_novih_termina_bezbedno
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: bez novih termina — bezbedno

### BandPage.note.ceka_potvrdu
- KEY: BandPage.note.ceka_potvrdu
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: čeka potvrdu

### BandPage.note.chabar_kalendar_samo_novi
- KEY: BandPage.note.chabar_kalendar_samo_novi
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: Chabar → kalendar (samo novi)

### BandPage.note.pa_izaberi_kalendar_benda
- KEY: BandPage.note.pa_izaberi_kalendar_benda
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: pa izaberi kalendar benda

### BandPage.note.povezi_postojeci_google_calendar
- KEY: BandPage.note.povezi_postojeci_google_calendar
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: poveži postojeći Google calendar

### BandPage.note.samo_connector_v1
- KEY: BandPage.note.samo_connector_v1
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: samo connector (v1)

### BandPage.note.samo_danas_pa_nadalje
- KEY: BandPage.note.samo_danas_pa_nadalje
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: samo danas pa nadalje

### BandPage.note.uskoro
- KEY: BandPage.note.uskoro
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: uskoro

### BandPage.note.uskoro_2
- KEY: BandPage.note.uskoro_2
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: uskoro

### BandPage.note.uskoro_3
- KEY: BandPage.note.uskoro_3
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: uskoro

### BandPage.note.uskoro_4
- KEY: BandPage.note.uskoro_4
- FILE: src/BandPage.jsx
- KIND: note
- TEXT: uskoro

### BandPage.placeholder.ime_ili_email
- KEY: BandPage.placeholder.ime_ili_email
- FILE: src/BandPage.jsx
- KIND: placeholder
- TEXT: Ime ili email…

### BandPage.text.
- KEY: BandPage.text.
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: ))}

### BandPage.text.bend_kalendar
- KEY: BandPage.text.bend_kalendar
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: bend kalendar

### BandPage.text.bez_novih_termina_bezbedno
- KEY: BandPage.text.bez_novih_termina_bezbedno
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: bez novih termina — bezbedno

### BandPage.text.brisanje_je_trajno_termini_clanstva
- KEY: BandPage.text.brisanje_je_trajno_termini_clanstva
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Brisanje je trajno (termini + članstva).

### BandPage.text.ceka_potvrdu
- KEY: BandPage.text.ceka_potvrdu
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: čeka potvrdu

### BandPage.text.chabar_kalendar_samo_novi
- KEY: BandPage.text.chabar_kalendar_samo_novi
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Chabar → kalendar (samo novi)

### BandPage.text.google_kalendar
- KEY: BandPage.text.google_kalendar
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Google kalendar

### BandPage.text.izaberi_bend_da_vidis_clanove
- KEY: BandPage.text.izaberi_bend_da_vidis_clanove
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Izaberi bend da vidiš članove.

### BandPage.text.izaberi_bend_za_clanove_i_alate
- KEY: BandPage.text.izaberi_bend_za_clanove_i_alate
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Izaberi bend za članove i alate.

### BandPage.text.jedan_google_nalog_po_bendu_biras_koji_kalendar_
- KEY: BandPage.text.jedan_google_nalog_po_bendu_biras_koji_kalendar_
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Jedan Google nalog → po bendu biraš koji kalendar (npr. Saint Louis / Marko Louis). Sync ne dira kalendare drugih članova.

### BandPage.text.licni_prostor_nema_liste_clanova
- KEY: BandPage.text.licni_prostor_nema_liste_clanova
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Lični prostor — nema liste članova.

### BandPage.text.nema_clana_za_prenos_prvo_pozovi_nekoga
- KEY: BandPage.text.nema_clana_za_prenos_prvo_pozovi_nekoga
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Nema člana za prenos — prvo pozovi nekoga.

### BandPage.text.nema_clanova_za_uklanjanje
- KEY: BandPage.text.nema_clanova_za_uklanjanje
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Nema članova za uklanjanje.

### BandPage.text.nema_drugih_clanova
- KEY: BandPage.text.nema_drugih_clanova
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Nema drugih članova.

### BandPage.text.nema_drugih_registrovanih_unesi_email_i_pritisni
- KEY: BandPage.text.nema_drugih_registrovanih_unesi_email_i_pritisni
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Nema drugih registrovanih. Unesi email i pritisni Pozovi.

### BandPage.text.nema_kalendara_sa_write_pristupom
- KEY: BandPage.text.nema_kalendara_sa_write_pristupom
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Nema kalendara sa write pristupom.

### BandPage.text.nema_ucitanih_clanova
- KEY: BandPage.text.nema_ucitanih_clanova
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Nema učitanih članova.

### BandPage.text.null
- KEY: BandPage.text.null
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: ) : null}

### BandPage.text.obrisi_bend
- KEY: BandPage.text.obrisi_bend
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Obriši bend

### BandPage.text.ostalo
- KEY: BandPage.text.ostalo
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Ostalo

### BandPage.text.pa_izaberi_kalendar_benda
- KEY: BandPage.text.pa_izaberi_kalendar_benda
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: pa izaberi kalendar benda

### BandPage.text.povezi_postojeci_google_calendar
- KEY: BandPage.text.povezi_postojeci_google_calendar
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: poveži postojeći Google calendar

### BandPage.text.pozivnica
- KEY: BandPage.text.pozivnica
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: pozivnica

### BandPage.text.prenesi_vlasnistvo_na_postojeceg_clana_ti_postaj
- KEY: BandPage.text.prenesi_vlasnistvo_na_postojeceg_clana_ti_postaj
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Prenesi vlasništvo na postojećeg člana. Ti postaješ lead.

### BandPage.text.prevuci_desno_da_zatvoris
- KEY: BandPage.text.prevuci_desno_da_zatvoris
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: prevuci desno da zatvoriš

### BandPage.text.prevuci_za_vise
- KEY: BandPage.text.prevuci_za_vise
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: ← prevuci za više

### BandPage.text.salje_se_pozivnica_ulaze_tek_kad_potvrde
- KEY: BandPage.text.salje_se_pozivnica_ulaze_tek_kad_potvrde
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Šalje se pozivnica — ulaze tek kad potvrde.

### BandPage.text.samo_connector_v1
- KEY: BandPage.text.samo_connector_v1
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: samo connector (v1)

### BandPage.text.samo_danas_pa_nadalje
- KEY: BandPage.text.samo_danas_pa_nadalje
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: samo danas pa nadalje

### BandPage.text.samo_osoba_koja_je_povezala_moze_menjati_link_v1
- KEY: BandPage.text.samo_osoba_koja_je_povezala_moze_menjati_link_v1
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Samo osoba koja je povezala može menjati link (v1).

### BandPage.text.sync_nije_konfigurisan_na_serveru
- KEY: BandPage.text.sync_nije_konfigurisan_na_serveru
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Sync nije konfigurisan na serveru.

### BandPage.text.trazi_clana
- KEY: BandPage.text.trazi_clana
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Traži člana

### BandPage.text.ucitavam
- KEY: BandPage.text.ucitavam
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Učitavam…

### BandPage.text.uskoro
- KEY: BandPage.text.uskoro
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: uskoro

### BandPage.text.uskoro_2
- KEY: BandPage.text.uskoro_2
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: uskoro

### BandPage.text.uskoro_3
- KEY: BandPage.text.uskoro_3
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: uskoro

### BandPage.text.uskoro_4
- KEY: BandPage.text.uskoro_4
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: uskoro

### BandPage.text.vise
- KEY: BandPage.text.vise
- FILE: src/BandPage.jsx
- KIND: label
- TEXT: Više

### BandPage.title.dozvola_za_slanje_pozivnica
- KEY: BandPage.title.dozvola_za_slanje_pozivnica
- FILE: src/BandPage.jsx
- KIND: title
- TEXT: Dozvola za slanje pozivnica

### BandPage.title.nazad_na_raspored
- KEY: BandPage.title.nazad_na_raspored
- FILE: src/BandPage.jsx
- KIND: title
- TEXT: Nazad na raspored

### BandPage.title.prethodni_mesec
- KEY: BandPage.title.prethodni_mesec
- FILE: src/BandPage.jsx
- KIND: title
- TEXT: Prethodni mesec

### BandPage.title.sledeci_mesec
- KEY: BandPage.title.sledeci_mesec
- FILE: src/BandPage.jsx
- KIND: title
- TEXT: Sledeći mesec

### BandPage.title.vise
- KEY: BandPage.title.vise
- FILE: src/BandPage.jsx
- KIND: title
- TEXT: Više

### BandPage.toast.azurirano_result_updated_uvezeno_0_preskoceno_re
- KEY: BandPage.toast.azurirano_result_updated_uvezeno_0_preskoceno_re
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Ažurirano {updated} (uvezeno 0, preskočeno {0})

### BandPage.toast.brisanje_nije_uspelo
- KEY: BandPage.toast.brisanje_nije_uspelo
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Brisanje nije uspelo

### BandPage.toast.brisanje_nije_uspelo_2
- KEY: BandPage.toast.brisanje_nije_uspelo_2
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Brisanje nije uspelo

### BandPage.toast.dodavanje_nije_uspelo
- KEY: BandPage.toast.dodavanje_nije_uspelo
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Dodavanje nije uspelo

### BandPage.toast.dozvola_nije_promenjena
- KEY: BandPage.toast.dozvola_nije_promenjena
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Dozvola nije promenjena

### BandPage.toast.greske_result_errors
- KEY: BandPage.toast.greske_result_errors
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: , greške {errors}

### BandPage.toast.izaberi_korisnika_iz_liste_ili_unesi_email_za_po
- KEY: BandPage.toast.izaberi_korisnika_iz_liste_ili_unesi_email_za_po
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Izaberi korisnika iz liste ili unesi email za pozivnicu.

### BandPage.toast.izmena_nije_uspela
- KEY: BandPage.toast.izmena_nije_uspela
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Izmena nije uspela

### BandPage.toast.kalendar_odvezan
- KEY: BandPage.toast.kalendar_odvezan
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Kalendar odvezan

### BandPage.toast.lista_kalendara_nije_uspela
- KEY: BandPage.toast.lista_kalendara_nije_uspela
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Lista kalendara nije uspela

### BandPage.toast.member_name_bandrolelabel_memberrole
- KEY: BandPage.toast.member_name_bandrolelabel_memberrole
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: {name}: {memberRole}

### BandPage.toast.member_name_bez_pozivnica
- KEY: BandPage.toast.member_name_bez_pozivnica
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: {name}: bez pozivnica

### BandPage.toast.member_name_moze_pozivati
- KEY: BandPage.toast.member_name_moze_pozivati
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: {name}: može pozivati

### BandPage.toast.mozes_obrisati_dugmetom_obrisi_uvezeno
- KEY: BandPage.toast.mozes_obrisati_dugmetom_obrisi_uvezeno
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: — možeš obrisati dugmetom „Obriši uvezeno”

### BandPage.toast.obrisan_bend_name
- KEY: BandPage.toast.obrisan_bend_name
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Obrisan bend: {name}

### BandPage.toast.obrisano_result_deleted_uvezenih_termina_google_
- KEY: BandPage.toast.obrisano_result_deleted_uvezenih_termina_google_
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Obrisano {deleted} uvezenih termina (Google netaknut)

### BandPage.toast.odvezivanje_nije_uspelo
- KEY: BandPage.toast.odvezivanje_nije_uspelo
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Odvezivanje nije uspelo

### BandPage.toast.poslato_result_created_povezano_result_linked_0
- KEY: BandPage.toast.poslato_result_created_povezano_result_linked_0
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Poslato {created}, povezano {0},

### BandPage.toast.povezano_cal_summary
- KEY: BandPage.toast.povezano_cal_summary
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Povezano: {summary}

### BandPage.toast.povezivanje_nije_uspelo
- KEY: BandPage.toast.povezivanje_nije_uspelo
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Povezivanje nije uspelo

### BandPage.toast.povezivanje_nije_uspelo_2
- KEY: BandPage.toast.povezivanje_nije_uspelo_2
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Povezivanje nije uspelo

### BandPage.toast.pozivnica_poslata_result_email_ceka_potvrdu
- KEY: BandPage.toast.pozivnica_poslata_result_email_ceka_potvrdu
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Pozivnica poslata: {email} (čeka potvrdu)

### BandPage.toast.pozivnica_result_email
- KEY: BandPage.toast.pozivnica_result_email
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Pozivnica: {email}

### BandPage.toast.pozivnica_sacuvana_result_email
- KEY: BandPage.toast.pozivnica_sacuvana_result_email
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Pozivnica sačuvana: {email}

### BandPage.toast.prenos_nije_uspeo
- KEY: BandPage.toast.prenos_nije_uspeo
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Prenos nije uspeo

### BandPage.toast.slanje_nije_uspelo
- KEY: BandPage.toast.slanje_nije_uspelo
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Slanje nije uspelo

### BandPage.toast.sync_iskljucen
- KEY: BandPage.toast.sync_iskljucen
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Sync isključen

### BandPage.toast.sync_nije_uspeo
- KEY: BandPage.toast.sync_nije_uspeo
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Sync nije uspeo

### BandPage.toast.sync_ukljucen
- KEY: BandPage.toast.sync_ukljucen
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Sync uključen

### BandPage.toast.uklanjanje_nije_uspelo
- KEY: BandPage.toast.uklanjanje_nije_uspelo
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Uklanjanje nije uspelo

### BandPage.toast.uklonjen_a_member_name
- KEY: BandPage.toast.uklonjen_a_member_name
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Uklonjen/a: {name}

### BandPage.toast.uloga_nije_promenjena
- KEY: BandPage.toast.uloga_nije_promenjena
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Uloga nije promenjena

### BandPage.toast.uvezeno_result_imported_azurirano_result_updated
- KEY: BandPage.toast.uvezeno_result_imported_azurirano_result_updated
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Uvezeno {imported}, ažurirano {updated}, preskočeno {0}

### BandPage.toast.uvoz_nije_uspeo
- KEY: BandPage.toast.uvoz_nije_uspeo
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Uvoz nije uspeo

### BandPage.toast.vlasnistvo_member_name
- KEY: BandPage.toast.vlasnistvo_member_name
- FILE: src/BandPage.jsx
- KIND: toast
- TEXT: Vlasništvo: {name}


## confirm

### confirm.defaults.alertTitle
- KEY: confirm.defaults.alertTitle
- FILE: src/confirmDialog.jsx
- KIND: confirm
- TEXT: Obaveštenje

### confirm.defaults.cancel
- KEY: confirm.defaults.cancel
- FILE: src/confirmDialog.jsx
- KIND: confirm
- TEXT: Otkaži

### confirm.defaults.confirm
- KEY: confirm.defaults.confirm
- FILE: src/confirmDialog.jsx
- KIND: confirm
- TEXT: Potvrdi

### confirm.defaults.ok
- KEY: confirm.defaults.ok
- FILE: src/confirmDialog.jsx
- KIND: confirm
- TEXT: U redu

### confirm.defaults.title
- KEY: confirm.defaults.title
- FILE: src/confirmDialog.jsx
- KIND: confirm
- TEXT: Potvrda


## ErrorBoundary

### ErrorBoundary.text.aplikacija_se_zaustavila_osvezi_stranicu_ili_se_
- KEY: ErrorBoundary.text.aplikacija_se_zaustavila_osvezi_stranicu_ili_se_
- FILE: src/ErrorBoundary.jsx
- KIND: label
- TEXT: Aplikacija se zaustavila. Osveži stranicu ili se vrati na početak.

### ErrorBoundary.text.nesto_nije_u_redu
- KEY: ErrorBoundary.text.nesto_nije_u_redu
- FILE: src/ErrorBoundary.jsx
- KIND: label
- TEXT: Nešto nije u redu


## fieldSelect

### fieldSelect.placeholder
- KEY: fieldSelect.placeholder
- FILE: src/FieldSelect.jsx
- KIND: placeholder
- TEXT: — Izaberi —


## gcal

### gcal.event.createdVia
- KEY: gcal.event.createdVia
- FILE: server/googleCalendar.js
- KIND: note
- TEXT: created via chabar.rs


## LegalPage

### LegalPage.aria.nazad
- KEY: LegalPage.aria.nazad
- FILE: src/LegalPage.jsx
- KIND: aria
- TEXT: Nazad

### LegalPage.confirm.title.politika_kolacica
- KEY: LegalPage.confirm.title.politika_kolacica
- FILE: src/LegalPage.jsx
- KIND: confirm (title)
- TEXT: Politika kolačića

### LegalPage.confirm.title.politika_privatnosti
- KEY: LegalPage.confirm.title.politika_privatnosti
- FILE: src/LegalPage.jsx
- KIND: confirm (title)
- TEXT: Politika privatnosti

### LegalPage.confirm.title.pravne_informacije
- KEY: LegalPage.confirm.title.pravne_informacije
- FILE: src/LegalPage.jsx
- KIND: confirm (title)
- TEXT: Pravne informacije

### LegalPage.confirm.title.uslovi_koriscenja
- KEY: LegalPage.confirm.title.uslovi_koriscenja
- FILE: src/LegalPage.jsx
- KIND: confirm (title)
- TEXT: Uslovi korišćenja

### LegalPage.text.nazad
- KEY: LegalPage.text.nazad
- FILE: src/LegalPage.jsx
- KIND: label
- TEXT: Nazad

### LegalPage.text.sadrzaj_ove_stranice_bice_dopunjen_stranica_je_p
- KEY: LegalPage.text.sadrzaj_ove_stranice_bice_dopunjen_stranica_je_p
- FILE: src/LegalPage.jsx
- KIND: label
- TEXT: Sadržaj ove stranice biće dopunjen. Stranica je pripremljena zbog zakonskih zahteva (prodavnice aplikacija, privatnost, uslovi korišćenja).


## LoginPage

### LoginPage.aria.pravne_stranice
- KEY: LoginPage.aria.pravne_stranice
- FILE: src/LoginPage.jsx
- KIND: aria
- TEXT: Pravne stranice

### LoginPage.text.nastavi_sa_google
- KEY: LoginPage.text.nastavi_sa_google
- FILE: src/LoginPage.jsx
- KIND: label
- TEXT: Nastavi sa Google

### LoginPage.text.pristup_rasporedu_i_finansijama_je_vezan_za_tvoj
- KEY: LoginPage.text.pristup_rasporedu_i_finansijama_je_vezan_za_tvoj
- FILE: src/LoginPage.jsx
- KIND: label
- TEXT: Pristup rasporedu i finansijama je vezan za tvoj nalog i bendove.


## MenuSelect

### MenuSelect.title.label_selected_label
- KEY: MenuSelect.title.label_selected_label
- FILE: src/MenuSelect.jsx
- KIND: title
- TEXT: {label}: {label}


## RasporedSkeleton

### RasporedSkeleton.aria.ucitavanje
- KEY: RasporedSkeleton.aria.ucitavanje
- FILE: src/RasporedSkeleton.jsx
- KIND: aria
- TEXT: Učitavanje

### RasporedSkeleton.text.null
- KEY: RasporedSkeleton.text.null
- FILE: src/RasporedSkeleton.jsx
- KIND: label
- TEXT: : null}


## report

### report.pay.open
- KEY: report.pay.open
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Otvoreno

### report.pay.paid
- KEY: report.pay.paid
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Plaćeno

### report.pay.partial
- KEY: report.pay.partial
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Delimično

### report.pay.unpaid
- KEY: report.pay.unpaid
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Neplaćeno

### report.status.all
- KEY: report.status.all
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Sve stavke

### report.status.done
- KEY: report.status.done
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Samo dospele

### report.status.future
- KEY: report.status.future
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Buduće

### report.status.paid
- KEY: report.status.paid
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Plaćene

### report.status.unpaid
- KEY: report.status.unpaid
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Dospele neplaćene


## ReportPage

### ReportPage.aria.alat_uskoro
- KEY: ReportPage.aria.alat_uskoro
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Alat (uskoro)

### ReportPage.aria.alat_uskoro_2
- KEY: ReportPage.aria.alat_uskoro_2
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Alat (uskoro)

### ReportPage.aria.alati_finansija
- KEY: ReportPage.aria.alati_finansija
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Alati finansija

### ReportPage.aria.datumi
- KEY: ReportPage.aria.datumi
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Datumi

### ReportPage.aria.filteri_finansija
- KEY: ReportPage.aria.filteri_finansija
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Filteri finansija

### ReportPage.aria.finansije_sekcije
- KEY: ReportPage.aria.finansije_sekcije
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Finansije sekcije

### ReportPage.aria.honorari_po_clanu
- KEY: ReportPage.aria.honorari_po_clanu
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Honorari po članu

### ReportPage.aria.prethodna_stranica
- KEY: ReportPage.aria.prethodna_stranica
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Prethodna stranica

### ReportPage.aria.pretraga
- KEY: ReportPage.aria.pretraga
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Pretraga

### ReportPage.aria.sledeca_stranica
- KEY: ReportPage.aria.sledeca_stranica
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Sledeća stranica

### ReportPage.aria.stranice
- KEY: ReportPage.aria.stranice
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Stranice

### ReportPage.aria.uplate
- KEY: ReportPage.aria.uplate
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Uplate

### ReportPage.aria.zatvori
- KEY: ReportPage.aria.zatvori
- FILE: src/ReportPage.jsx
- KIND: aria
- TEXT: Zatvori

### ReportPage.option.buduce
- KEY: ReportPage.option.buduce
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Buduće

### ReportPage.option.dospele_neplacene
- KEY: ReportPage.option.dospele_neplacene
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Dospele neplaćene

### ReportPage.option.placene
- KEY: ReportPage.option.placene
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Plaćene

### ReportPage.option.samo_dospele
- KEY: ReportPage.option.samo_dospele
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Samo dospele

### ReportPage.option.sve_stavke
- KEY: ReportPage.option.sve_stavke
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Sve stavke

### ReportPage.option.svi_bendovi
- KEY: ReportPage.option.svi_bendovi
- FILE: src/ReportPage.jsx
- KIND: option
- TEXT: Svi bendovi

### ReportPage.placeholder.mesto_lokal
- KEY: ReportPage.placeholder.mesto_lokal
- FILE: src/ReportPage.jsx
- KIND: placeholder
- TEXT: mesto, lokal...

### ReportPage.text.bend_mod
- KEY: ReportPage.text.bend_mod
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Bend mod

### ReportPage.text.detalj_termina
- KEY: ReportPage.text.detalj_termina
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Detalj termina

### ReportPage.text.godina
- KEY: ReportPage.text.godina
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Godina

### ReportPage.text.obracun
- KEY: ReportPage.text.obracun
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Obračun

### ReportPage.text.osnovno
- KEY: ReportPage.text.osnovno
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Osnovno

### ReportPage.text.prevoz
- KEY: ReportPage.text.prevoz
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Prevoz

### ReportPage.text.ukupno
- KEY: ReportPage.text.ukupno
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Ukupno

### ReportPage.text.uplata_bendu
- KEY: ReportPage.text.uplata_bendu
- FILE: src/ReportPage.jsx
- KIND: label
- TEXT: Uplata bendu

### ReportPage.title.pretraga
- KEY: ReportPage.title.pretraga
- FILE: src/ReportPage.jsx
- KIND: title
- TEXT: Pretraga

### ReportPage.title.uskoro
- KEY: ReportPage.title.uskoro
- FILE: src/ReportPage.jsx
- KIND: title
- TEXT: Uskoro

### ReportPage.title.uskoro_2
- KEY: ReportPage.title.uskoro_2
- FILE: src/ReportPage.jsx
- KIND: title
- TEXT: Uskoro

### ReportPage.title.zatvori
- KEY: ReportPage.title.zatvori
- FILE: src/ReportPage.jsx
- KIND: title
- TEXT: Zatvori


## schedule

### schedule.filter.all
- KEY: schedule.filter.all
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: Sve

### schedule.filter.done
- KEY: schedule.filter.done
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: Prošle

### schedule.filter.month
- KEY: schedule.filter.month
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: Ovaj mesec

### schedule.filter.upcoming
- KEY: schedule.filter.upcoming
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: Buduće


## SchedulePage

### SchedulePage.aria.dodaj
- KEY: SchedulePage.aria.dodaj
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Dodaj

### SchedulePage.aria.dodaj_2
- KEY: SchedulePage.aria.dodaj_2
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Dodaj

### SchedulePage.aria.filteri_rasporeda
- KEY: SchedulePage.aria.filteri_rasporeda
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Filteri rasporeda

### SchedulePage.aria.izmeni_termin
- KEY: SchedulePage.aria.izmeni_termin
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Izmeni termin

### SchedulePage.aria.moji_bendovi
- KEY: SchedulePage.aria.moji_bendovi
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Moji bendovi

### SchedulePage.aria.obrisi_termin
- KEY: SchedulePage.aria.obrisi_termin
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Obriši termin

### SchedulePage.aria.prethodna_stranica
- KEY: SchedulePage.aria.prethodna_stranica
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Prethodna stranica

### SchedulePage.aria.pretraga
- KEY: SchedulePage.aria.pretraga
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Pretraga

### SchedulePage.aria.sledeca_stranica
- KEY: SchedulePage.aria.sledeca_stranica
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Sledeća stranica

### SchedulePage.aria.stranice
- KEY: SchedulePage.aria.stranice
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Stranice

### SchedulePage.aria.termini
- KEY: SchedulePage.aria.termini
- FILE: src/SchedulePage.jsx
- KIND: aria
- TEXT: Termini

### SchedulePage.confirm.cancelLabel.ostani
- KEY: SchedulePage.confirm.cancelLabel.ostani
- FILE: src/SchedulePage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Ostani

### SchedulePage.confirm.cancelLabel.otkazi
- KEY: SchedulePage.confirm.cancelLabel.otkazi
- FILE: src/SchedulePage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### SchedulePage.confirm.cancelLabel.otkazi_2
- KEY: SchedulePage.confirm.cancelLabel.otkazi_2
- FILE: src/SchedulePage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### SchedulePage.confirm.confirmLabel.obrisi
- KEY: SchedulePage.confirm.confirmLabel.obrisi
- FILE: src/SchedulePage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Obriši

### SchedulePage.confirm.confirmLabel.sacuvaj
- KEY: SchedulePage.confirm.confirmLabel.sacuvaj
- FILE: src/SchedulePage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Sačuvaj

### SchedulePage.confirm.confirmLabel.zatvori
- KEY: SchedulePage.confirm.confirmLabel.zatvori
- FILE: src/SchedulePage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Zatvori

### SchedulePage.confirm.message.imas_nesacuvane_izmene_zatvoriti_formu_bez_cuvan
- KEY: SchedulePage.confirm.message.imas_nesacuvane_izmene_zatvoriti_formu_bez_cuvan
- FILE: src/SchedulePage.jsx
- KIND: confirm (message)
- TEXT: Imaš nesačuvane izmene. Zatvoriti formu bez čuvanja?

### SchedulePage.confirm.message.label_n_nova_akcija_se_ne_moze_ponistiti
- KEY: SchedulePage.confirm.message.label_n_nova_akcija_se_ne_moze_ponistiti
- FILE: src/SchedulePage.jsx
- KIND: confirm (message)
- TEXT: {label}\n\nOva akcija se ne može poništiti.

### SchedulePage.confirm.title.nesacuvane_izmene
- KEY: SchedulePage.confirm.title.nesacuvane_izmene
- FILE: src/SchedulePage.jsx
- KIND: confirm (title)
- TEXT: Nesačuvane izmene

### SchedulePage.confirm.title.obrisati_termin
- KEY: SchedulePage.confirm.title.obrisati_termin
- FILE: src/SchedulePage.jsx
- KIND: confirm (title)
- TEXT: Obrisati termin?

### SchedulePage.confirm.title.sacuvati_izmene
- KEY: SchedulePage.confirm.title.sacuvati_izmene
- FILE: src/SchedulePage.jsx
- KIND: confirm (title)
- TEXT: Sačuvati izmene?

### SchedulePage.error.datum_je_obavezan
- KEY: SchedulePage.error.datum_je_obavezan
- FILE: src/SchedulePage.jsx
- KIND: error
- TEXT: Datum je obavezan.

### SchedulePage.error.datum_nije_ispravan_izaberi_datum_iz_kalendara
- KEY: SchedulePage.error.datum_nije_ispravan_izaberi_datum_iz_kalendara
- FILE: src/SchedulePage.jsx
- KIND: error
- TEXT: Datum nije ispravan. Izaberi datum iz kalendara.

### SchedulePage.error.moras_izabrati_bend_ili_personal
- KEY: SchedulePage.error.moras_izabrati_bend_ili_personal
- FILE: src/SchedulePage.jsx
- KIND: error
- TEXT: Moraš izabrati bend ili Personal.

### SchedulePage.error.nema_izmena_za_cuvanje
- KEY: SchedulePage.error.nema_izmena_za_cuvanje
- FILE: src/SchedulePage.jsx
- KIND: error
- TEXT: Nema izmena za čuvanje.

### SchedulePage.error.unesi_bar_mesto_lokal_ili_napomenu
- KEY: SchedulePage.error.unesi_bar_mesto_lokal_ili_napomenu
- FILE: src/SchedulePage.jsx
- KIND: error
- TEXT: Unesi bar mesto, lokal ili napomenu.

### SchedulePage.option.band_name_band_kind_personal_licno
- KEY: SchedulePage.option.band_name_band_kind_personal_licno
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: {name}{no}

### SchedulePage.option.buduce
- KEY: SchedulePage.option.buduce
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: Buduće

### SchedulePage.option.ovaj_mesec
- KEY: SchedulePage.option.ovaj_mesec
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: Ovaj mesec

### SchedulePage.option.prosle
- KEY: SchedulePage.option.prosle
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: Prošle

### SchedulePage.option.sve
- KEY: SchedulePage.option.sve
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: Sve

### SchedulePage.option.svi_bendovi
- KEY: SchedulePage.option.svi_bendovi
- FILE: src/SchedulePage.jsx
- KIND: option
- TEXT: Svi bendovi

### SchedulePage.placeholder.bend_tip_doga_aja
- KEY: SchedulePage.placeholder.bend_tip_doga_aja
- FILE: src/SchedulePage.jsx
- KIND: placeholder
- TEXT: Bend, tip događaja...

### SchedulePage.placeholder.beograd_novi_sad
- KEY: SchedulePage.placeholder.beograd_novi_sad
- FILE: src/SchedulePage.jsx
- KIND: placeholder
- TEXT: Beograd, Novi Sad...

### SchedulePage.placeholder.ime_kluba_prostora
- KEY: SchedulePage.placeholder.ime_kluba_prostora
- FILE: src/SchedulePage.jsx
- KIND: placeholder
- TEXT: Ime kluba / prostora

### SchedulePage.placeholder.izaberi
- KEY: SchedulePage.placeholder.izaberi
- FILE: src/SchedulePage.jsx
- KIND: placeholder
- TEXT: — Izaberi —

### SchedulePage.placeholder.mesto_lokal_napomena
- KEY: SchedulePage.placeholder.mesto_lokal_napomena
- FILE: src/SchedulePage.jsx
- KIND: placeholder
- TEXT: mesto, lokal, napomena...

### SchedulePage.placeholder.npr_chabar
- KEY: SchedulePage.placeholder.npr_chabar
- FILE: src/SchedulePage.jsx
- KIND: placeholder
- TEXT: npr. Chabar

### SchedulePage.text.dodaj_termin
- KEY: SchedulePage.text.dodaj_termin
- FILE: src/SchedulePage.jsx
- KIND: label
- TEXT: Dodaj termin

### SchedulePage.text.nema_termina_za_ovaj_filter
- KEY: SchedulePage.text.nema_termina_za_ovaj_filter
- FILE: src/SchedulePage.jsx
- KIND: label
- TEXT: Nema termina za ovaj filter.

### SchedulePage.text.novi_bend
- KEY: SchedulePage.text.novi_bend
- FILE: src/SchedulePage.jsx
- KIND: label
- TEXT: Novi bend

### SchedulePage.text.otkazi
- KEY: SchedulePage.text.otkazi
- FILE: src/SchedulePage.jsx
- KIND: label
- TEXT: Otkaži

### SchedulePage.title.dodaj_termin_ili_bend
- KEY: SchedulePage.title.dodaj_termin_ili_bend
- FILE: src/SchedulePage.jsx
- KIND: title
- TEXT: Dodaj termin ili bend

### SchedulePage.title.izmeni_termin
- KEY: SchedulePage.title.izmeni_termin
- FILE: src/SchedulePage.jsx
- KIND: title
- TEXT: Izmeni termin

### SchedulePage.title.obrisi_termin
- KEY: SchedulePage.title.obrisi_termin
- FILE: src/SchedulePage.jsx
- KIND: title
- TEXT: Obriši termin

### SchedulePage.title.pretraga
- KEY: SchedulePage.title.pretraga
- FILE: src/SchedulePage.jsx
- KIND: title
- TEXT: Pretraga

### SchedulePage.title.prosli_termin_je_zakljucan
- KEY: SchedulePage.title.prosli_termin_je_zakljucan
- FILE: src/SchedulePage.jsx
- KIND: title
- TEXT: Prošli termin je zaključan

### SchedulePage.toast.bend_kreiran
- KEY: SchedulePage.toast.bend_kreiran
- FILE: src/SchedulePage.jsx
- KIND: toast
- TEXT: Bend kreiran: {name}

### SchedulePage.toast.bend_kreiran_created_name
- KEY: SchedulePage.toast.bend_kreiran_created_name
- FILE: src/SchedulePage.jsx
- KIND: toast
- TEXT: Bend kreiran: {name}

### SchedulePage.toast.kreiranje_benda_nije_uspelo
- KEY: SchedulePage.toast.kreiranje_benda_nije_uspelo
- FILE: src/SchedulePage.jsx
- KIND: toast
- TEXT: Kreiranje benda nije uspelo

### SchedulePage.toast.limit_najvise_ownerlimit_grupnih_bendova_zatrazi
- KEY: SchedulePage.toast.limit_najvise_ownerlimit_grupnih_bendova_zatrazi
- FILE: src/SchedulePage.jsx
- KIND: toast
- TEXT: Limit: najviše {ownerLimit} grupnih bendova. Zatraži grant za više.


## server

### server.auth.api.auth_not_configured
- KEY: server.auth.api.auth_not_configured
- FILE: server/auth.js
- KIND: error
- TEXT: Auth not configured

### server.auth.api.band_lead_role_required
- KEY: server.auth.api.band_lead_role_required
- FILE: server/auth.js
- KIND: error (detail)
- TEXT: Band lead role required

### server.auth.api.forbidden
- KEY: server.auth.api.forbidden
- FILE: server/auth.js
- KIND: error
- TEXT: Forbidden

### server.auth.api.forbidden_2
- KEY: server.auth.api.forbidden_2
- FILE: server/auth.js
- KIND: error
- TEXT: Forbidden

### server.auth.api.missing_access_token
- KEY: server.auth.api.missing_access_token
- FILE: server/auth.js
- KIND: error (detail)
- TEXT: Missing access token

### server.auth.api.missing_band
- KEY: server.auth.api.missing_band
- FILE: server/auth.js
- KIND: error
- TEXT: Missing band

### server.auth.api.missing_supabase_env_keys
- KEY: server.auth.api.missing_supabase_env_keys
- FILE: server/auth.js
- KIND: error (detail)
- TEXT: Missing Supabase env keys

### server.auth.api.nalog_nije_mogao_da_se_dovrsi_pokusaj_ponovo_ili
- KEY: server.auth.api.nalog_nije_mogao_da_se_dovrsi_pokusaj_ponovo_ili
- FILE: server/auth.js
- KIND: error (detail)
- TEXT: Nalog nije mogao da se dovrši. Pokušaj ponovo ili kontaktiraj podršku.

### server.auth.api.not_a_member_of_this_band
- KEY: server.auth.api.not_a_member_of_this_band
- FILE: server/auth.js
- KIND: error (detail)
- TEXT: Not a member of this band

### server.auth.api.setup_failed
- KEY: server.auth.api.setup_failed
- FILE: server/auth.js
- KIND: error
- TEXT: Setup failed

### server.auth.api.unauthorized
- KEY: server.auth.api.unauthorized
- FILE: server/auth.js
- KIND: error
- TEXT: Unauthorized

### server.auth.api.unauthorized_2
- KEY: server.auth.api.unauthorized_2
- FILE: server/auth.js
- KIND: error
- TEXT: Unauthorized

### server.auth.api.x_band_id_header_required
- KEY: server.auth.api.x_band_id_header_required
- FILE: server/auth.js
- KIND: error (detail)
- TEXT: X-Band-Id header required

### server.bands.api.already_member
- KEY: server.bands.api.already_member
- FILE: server/bands.js
- KIND: error
- TEXT: Already member

### server.bands.api.bend_vec_ima_max_pending_invites_per_band_otvore
- KEY: server.bands.api.bend_vec_ima_max_pending_invites_per_band_otvore
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Bend već ima {MAX_PENDING_INVITES_PER_BAND} otvorenih pozivnica.

### server.bands.api.clan_mora_vec_biti_u_bendu
- KEY: server.bands.api.clan_mora_vec_biti_u_bendu
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Član mora već biti u bendu.

### server.bands.api.clan_nije_prona_en
- KEY: server.bands.api.clan_nije_prona_en
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Član nije pronađen.

### server.bands.api.clan_nije_prona_en_2
- KEY: server.bands.api.clan_nije_prona_en_2
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Član nije pronađen.

### server.bands.api.clan_nije_prona_en_3
- KEY: server.bands.api.clan_nije_prona_en_3
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Član nije pronađen.

### server.bands.api.dozvoljeno_lead_ili_member
- KEY: server.bands.api.dozvoljeno_lead_ili_member
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Dozvoljeno: lead ili member.

### server.bands.api.forbidden
- KEY: server.bands.api.forbidden
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.forbidden_10
- KEY: server.bands.api.forbidden_10
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.forbidden_2
- KEY: server.bands.api.forbidden_2
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.forbidden_3
- KEY: server.bands.api.forbidden_3
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.forbidden_4
- KEY: server.bands.api.forbidden_4
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.forbidden_5
- KEY: server.bands.api.forbidden_5
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.forbidden_6
- KEY: server.bands.api.forbidden_6
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.forbidden_7
- KEY: server.bands.api.forbidden_7
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.forbidden_8
- KEY: server.bands.api.forbidden_8
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.forbidden_9
- KEY: server.bands.api.forbidden_9
- FILE: server/bands.js
- KIND: error
- TEXT: Forbidden

### server.bands.api.invalid_band
- KEY: server.bands.api.invalid_band
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid band

### server.bands.api.invalid_band_2
- KEY: server.bands.api.invalid_band_2
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid band

### server.bands.api.invalid_band_3
- KEY: server.bands.api.invalid_band_3
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid band

### server.bands.api.invalid_band_4
- KEY: server.bands.api.invalid_band_4
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid band

### server.bands.api.invalid_email
- KEY: server.bands.api.invalid_email
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid email

### server.bands.api.invalid_input
- KEY: server.bands.api.invalid_input
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid input

### server.bands.api.invalid_invite
- KEY: server.bands.api.invalid_invite
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid invite

### server.bands.api.invalid_invite_2
- KEY: server.bands.api.invalid_invite_2
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid invite

### server.bands.api.invalid_name
- KEY: server.bands.api.invalid_name
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid name

### server.bands.api.invalid_role
- KEY: server.bands.api.invalid_role
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid role

### server.bands.api.invalid_role_2
- KEY: server.bands.api.invalid_role_2
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid role

### server.bands.api.invalid_role_3
- KEY: server.bands.api.invalid_role_3
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid role

### server.bands.api.invalid_user
- KEY: server.bands.api.invalid_user
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid user

### server.bands.api.invalid_user_2
- KEY: server.bands.api.invalid_user_2
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid user

### server.bands.api.invalid_user_3
- KEY: server.bands.api.invalid_user_3
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid user

### server.bands.api.invalid_user_4
- KEY: server.bands.api.invalid_user_4
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid user

### server.bands.api.invalid_user_5
- KEY: server.bands.api.invalid_user_5
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid user

### server.bands.api.invalid_user_6
- KEY: server.bands.api.invalid_user_6
- FILE: server/bands.js
- KIND: error
- TEXT: Invalid user

### server.bands.api.invites_blocked
- KEY: server.bands.api.invites_blocked
- FILE: server/bands.js
- KIND: error
- TEXT: Invites blocked

### server.bands.api.izaberi_clana
- KEY: server.bands.api.izaberi_clana
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Izaberi člana.

### server.bands.api.izaberi_korisnika_iz_pretrage_ili_unesi_validan_
- KEY: server.bands.api.izaberi_korisnika_iz_pretrage_ili_unesi_validan_
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Izaberi korisnika iz pretrage ili unesi validan email.

### server.bands.api.korisnik_je_vec_clan_benda
- KEY: server.bands.api.korisnik_je_vec_clan_benda
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Korisnik je već član benda.

### server.bands.api.korisnik_nije_prona_en
- KEY: server.bands.api.korisnik_nije_prona_en
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Korisnik nije pronađen.

### server.bands.api.lead_moze_samo_unaprediti_clana_u_lead
- KEY: server.bands.api.lead_moze_samo_unaprediti_clana_u_lead
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Lead može samo unaprediti člana u lead.

### server.bands.api.lead_moze_ukloniti_samo_obicne_clanove
- KEY: server.bands.api.lead_moze_ukloniti_samo_obicne_clanove
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Lead može ukloniti samo obične članove.

### server.bands.api.lead_ne_moze_menjati_dozvole_drugog_lead_a
- KEY: server.bands.api.lead_ne_moze_menjati_dozvole_drugog_lead_a
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Lead ne može menjati dozvole drugog lead-a.

### server.bands.api.lead_ne_moze_sniziti_drugog_lead_a_to_radi_vlasn
- KEY: server.bands.api.lead_ne_moze_sniziti_drugog_lead_a_to_radi_vlasn
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Lead ne može sniziti drugog lead-a. To radi vlasnik.

### server.bands.api.licni_bend_nema_clanove_za_dodavanje
- KEY: server.bands.api.licni_bend_nema_clanove_za_dodavanje
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Lični bend nema članove za dodavanje.

### server.bands.api.licni_bend_nema_prenos_vlasnistva
- KEY: server.bands.api.licni_bend_nema_prenos_vlasnistva
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Lični bend nema prenos vlasništva.

### server.bands.api.licni_bend_se_ne_brise
- KEY: server.bands.api.licni_bend_se_ne_brise
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Lični bend se ne briše.

### server.bands.api.licni_bend_se_ne_ure_uje_ovako
- KEY: server.bands.api.licni_bend_se_ne_ure_uje_ovako
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Lični bend se ne uređuje ovako.

### server.bands.api.missing_user
- KEY: server.bands.api.missing_user
- FILE: server/bands.js
- KIND: error
- TEXT: Missing user

### server.bands.api.missing_user_2
- KEY: server.bands.api.missing_user_2
- FILE: server/bands.js
- KIND: error
- TEXT: Missing user

### server.bands.api.missing_user_3
- KEY: server.bands.api.missing_user_3
- FILE: server/bands.js
- KIND: error
- TEXT: Missing user

### server.bands.api.missing_user_4
- KEY: server.bands.api.missing_user_4
- FILE: server/bands.js
- KIND: error
- TEXT: Missing user

### server.bands.api.mozes_biti_vlasnik_najvise_quota_ownerlimit_grup
- KEY: server.bands.api.mozes_biti_vlasnik_najvise_quota_ownerlimit_grup
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Možeš biti vlasnik najviše {ownerLimit} grupnih bendova. Zatraži grant za više.

### server.bands.api.mozes_kreirati_najvise_max_band_creates_per_day_
- KEY: server.bands.api.mozes_kreirati_najvise_max_band_creates_per_day_
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Možeš kreirati najviše {MAX_BAND_CREATES_PER_DAY} benda dnevno.

### server.bands.api.najvise_max_invites_per_day_pozivnica_dnevno
- KEY: server.bands.api.najvise_max_invites_per_day_pozivnica_dnevno
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Najviše {MAX_INVITES_PER_DAY} pozivnica dnevno.

### server.bands.api.ne_mozes_menjati_sopstvenu_ulogu_ovde
- KEY: server.bands.api.ne_mozes_menjati_sopstvenu_ulogu_ovde
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Ne možeš menjati sopstvenu ulogu ovde.

### server.bands.api.ne_mozes_pozvati_sebe
- KEY: server.bands.api.ne_mozes_pozvati_sebe
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Ne možeš pozvati sebe.

### server.bands.api.ne_mozes_ukloniti_sebe_ovde
- KEY: server.bands.api.ne_mozes_ukloniti_sebe_ovde
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Ne možeš ukloniti sebe ovde.

### server.bands.api.nemas_dozvolu_za_pozivnice_u_ovom_bendu
- KEY: server.bands.api.nemas_dozvolu_za_pozivnice_u_ovom_bendu
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Nemaš dozvolu za pozivnice u ovom bendu.

### server.bands.api.not_found
- KEY: server.bands.api.not_found
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.not_found_10
- KEY: server.bands.api.not_found_10
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.not_found_2
- KEY: server.bands.api.not_found_2
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.not_found_3
- KEY: server.bands.api.not_found_3
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.not_found_4
- KEY: server.bands.api.not_found_4
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.not_found_5
- KEY: server.bands.api.not_found_5
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.not_found_6
- KEY: server.bands.api.not_found_6
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.not_found_7
- KEY: server.bands.api.not_found_7
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.not_found_8
- KEY: server.bands.api.not_found_8
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.not_found_9
- KEY: server.bands.api.not_found_9
- FILE: server/bands.js
- KIND: error
- TEXT: Not found

### server.bands.api.ovaj_nalog_ne_prima_pozivnice_u_bendove
- KEY: server.bands.api.ovaj_nalog_ne_prima_pozivnice_u_bendove
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Ovaj nalog ne prima pozivnice u bendove.

### server.bands.api.owner_limit
- KEY: server.bands.api.owner_limit
- FILE: server/bands.js
- KIND: error
- TEXT: Owner limit

### server.bands.api.owner_limit_2
- KEY: server.bands.api.owner_limit_2
- FILE: server/bands.js
- KIND: error
- TEXT: Owner limit

### server.bands.api.potreban_je_validan_email
- KEY: server.bands.api.potreban_je_validan_email
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Potreban je validan email.

### server.bands.api.pozivnica_nije_prona_ena
- KEY: server.bands.api.pozivnica_nije_prona_ena
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Pozivnica nije pronađena.

### server.bands.api.pozivnica_nije_prona_ena_2
- KEY: server.bands.api.pozivnica_nije_prona_ena_2
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Pozivnica nije pronađena.

### server.bands.api.rate_limit
- KEY: server.bands.api.rate_limit
- FILE: server/bands.js
- KIND: error
- TEXT: Rate limit

### server.bands.api.rate_limit_2
- KEY: server.bands.api.rate_limit_2
- FILE: server/bands.js
- KIND: error
- TEXT: Rate limit

### server.bands.api.rate_limit_3
- KEY: server.bands.api.rate_limit_3
- FILE: server/bands.js
- KIND: error
- TEXT: Rate limit

### server.bands.api.samo_vlasnik_ili_lead_moze_menjati_dozvolu_za_po
- KEY: server.bands.api.samo_vlasnik_ili_lead_moze_menjati_dozvolu_za_po
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Samo vlasnik ili lead može menjati dozvolu za pozivnice.

### server.bands.api.samo_vlasnik_ili_lead_moze_menjati_uloge
- KEY: server.bands.api.samo_vlasnik_ili_lead_moze_menjati_uloge
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Samo vlasnik ili lead može menjati uloge.

### server.bands.api.samo_vlasnik_ili_lead_moze_uklanjati_clanove
- KEY: server.bands.api.samo_vlasnik_ili_lead_moze_uklanjati_clanove
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Samo vlasnik ili lead može uklanjati članove.

### server.bands.api.samo_vlasnik_moze_obrisati_bend
- KEY: server.bands.api.samo_vlasnik_moze_obrisati_bend
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Samo vlasnik može obrisati bend.

### server.bands.api.samo_vlasnik_moze_preneti_vlasnistvo
- KEY: server.bands.api.samo_vlasnik_moze_preneti_vlasnistvo
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Samo vlasnik može preneti vlasništvo.

### server.bands.api.sopstvenu_dozvolu_ne_menjas_ovde
- KEY: server.bands.api.sopstvenu_dozvolu_ne_menjas_ovde
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Sopstvenu dozvolu ne menjaš ovde.

### server.bands.api.taj_nalog_vec_ima_quota_ownedgroupbands_quota_ow
- KEY: server.bands.api.taj_nalog_vec_ima_quota_ownedgroupbands_quota_ow
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Taj nalog već ima {ownedGroupBands}/{ownerLimit} grupnih bendova kao vlasnik.

### server.bands.api.uloga_vlasnika_se_ne_menja_ovde_koristi_prenos_v
- KEY: server.bands.api.uloga_vlasnika_se_ne_menja_ovde_koristi_prenos_v
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Uloga vlasnika se ne menja ovde — koristi prenos vlasništva.

### server.bands.api.unesi_ime_benda
- KEY: server.bands.api.unesi_ime_benda
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Unesi ime benda.

### server.bands.api.vec_si_vlasnik
- KEY: server.bands.api.vec_si_vlasnik
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Već si vlasnik.

### server.bands.api.vlasnik_se_ne_moze_ukloniti_prenesi_vlasnistvo
- KEY: server.bands.api.vlasnik_se_ne_moze_ukloniti_prenesi_vlasnistvo
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Vlasnik se ne može ukloniti — prenesi vlasništvo.

### server.bands.api.vlasnik_uvek_moze_da_poziva
- KEY: server.bands.api.vlasnik_uvek_moze_da_poziva
- FILE: server/bands.js
- KIND: error (detail)
- TEXT: Vlasnik uvek može da poziva.

### server.exchangeRate.api.google_finance
- KEY: server.exchangeRate.api.google_finance
- FILE: server/exchangeRate.js
- KIND: error
- TEXT: Google Finance

### server.exchangeRate.api.nbs_srednji_kurs
- KEY: server.exchangeRate.api.nbs_srednji_kurs
- FILE: server/exchangeRate.js
- KIND: error
- TEXT: NBS srednji kurs

### server.googleCalendar.gcal.cena_price_eur
- KEY: server.googleCalendar.gcal.cena_price_eur
- FILE: server/googleCalendar.js
- KIND: note
- TEXT: Cena: {price} EUR

### server.googleCalendar.gcal.created_via_chabar_rs
- KEY: server.googleCalendar.gcal.created_via_chabar_rs
- FILE: server/googleCalendar.js
- KIND: note
- TEXT: created via chabar.rs

### server.googleCalendar.gcal.grad_string_event_city_trim
- KEY: server.googleCalendar.gcal.grad_string_event_city_trim
- FILE: server/googleCalendar.js
- KIND: note
- TEXT: Grad: {String(event.city).trim()}

### server.googleCalendar.gcal.lokal_string_event_venue_trim
- KEY: server.googleCalendar.gcal.lokal_string_event_venue_trim
- FILE: server/googleCalendar.js
- KIND: note
- TEXT: Lokal: {String(event.venue).trim()}

### server.googleCalendar.gcal.prevoz_transport_rsd
- KEY: server.googleCalendar.gcal.prevoz_transport_rsd
- FILE: server/googleCalendar.js
- KIND: note
- TEXT: Prevoz: {transport} RSD

### server.index.api.band_mode_is_only_for_group_bands
- KEY: server.index.api.band_mode_is_only_for_group_bands
- FILE: server/index.js
- KIND: error (detail)
- TEXT: Band mode is only for group bands

### server.index.api.bend_nema_povezan_google_kalendar
- KEY: server.index.api.bend_nema_povezan_google_kalendar
- FILE: server/index.js
- KIND: error
- TEXT: Bend nema povezan Google kalendar.

### server.index.api.calendarid_required
- KEY: server.index.api.calendarid_required
- FILE: server/index.js
- KIND: error
- TEXT: calendarId required

### server.index.api.exchange_rate_unavailable
- KEY: server.index.api.exchange_rate_unavailable
- FILE: server/index.js
- KIND: error
- TEXT: Exchange rate unavailable

### server.index.api.invalid_band
- KEY: server.index.api.invalid_band
- FILE: server/index.js
- KIND: error
- TEXT: Invalid band

### server.index.api.missing_personal_band
- KEY: server.index.api.missing_personal_band
- FILE: server/index.js
- KIND: error
- TEXT: Missing personal band

### server.index.api.not_found
- KEY: server.index.api.not_found
- FILE: server/index.js
- KIND: error
- TEXT: Not found

### server.index.api.not_found_2
- KEY: server.index.api.not_found_2
- FILE: server/index.js
- KIND: error
- TEXT: Not found

### server.index.api.not_found_3
- KEY: server.index.api.not_found_3
- FILE: server/index.js
- KIND: error
- TEXT: Not found

### server.index.api.not_found_4
- KEY: server.index.api.not_found_4
- FILE: server/index.js
- KIND: error
- TEXT: Not found

### server.index.api.nothing_to_update
- KEY: server.index.api.nothing_to_update
- FILE: server/index.js
- KIND: error
- TEXT: Nothing to update

### server.index.api.samo_connector_moze_obrisati_uvezeno
- KEY: server.index.api.samo_connector_moze_obrisati_uvezeno
- FILE: server/index.js
- KIND: error
- TEXT: Samo connector može obrisati uvezeno.

### server.index.api.samo_connector_moze_slati_u_google
- KEY: server.index.api.samo_connector_moze_slati_u_google
- FILE: server/index.js
- KIND: error
- TEXT: Samo connector može slati u Google.

### server.index.api.sync_je_iskljucen_za_ovaj_bend
- KEY: server.index.api.sync_je_iskljucen_za_ovaj_bend
- FILE: server/index.js
- KIND: error
- TEXT: Sync je isključen za ovaj bend.

### server.users.api.forbidden
- KEY: server.users.api.forbidden
- FILE: server/users.js
- KIND: error
- TEXT: Forbidden

### server.users.api.samo_vlasnik_ili_lead_moze_traziti_korisnike_za_
- KEY: server.users.api.samo_vlasnik_ili_lead_moze_traziti_korisnike_za_
- FILE: server/users.js
- KIND: error (detail)
- TEXT: Samo vlasnik ili lead može tražiti korisnike za bend.


## SettingsPage

### SettingsPage.aria.bendovi
- KEY: SettingsPage.aria.bendovi
- FILE: src/SettingsPage.jsx
- KIND: aria
- TEXT: Bendovi

### SettingsPage.aria.google_kalendar
- KEY: SettingsPage.aria.google_kalendar
- FILE: src/SettingsPage.jsx
- KIND: aria
- TEXT: Google kalendar

### SettingsPage.aria.izgled
- KEY: SettingsPage.aria.izgled
- FILE: src/SettingsPage.jsx
- KIND: aria
- TEXT: Izgled

### SettingsPage.aria.obracun
- KEY: SettingsPage.aria.obracun
- FILE: src/SettingsPage.jsx
- KIND: aria
- TEXT: Obračun

### SettingsPage.aria.pravno
- KEY: SettingsPage.aria.pravno
- FILE: src/SettingsPage.jsx
- KIND: aria
- TEXT: Pravno

### SettingsPage.confirm.cancelLabel.otkazi
- KEY: SettingsPage.confirm.cancelLabel.otkazi
- FILE: src/SettingsPage.jsx
- KIND: confirm (cancelLabel)
- TEXT: Otkaži

### SettingsPage.confirm.confirmLabel.odvezi
- KEY: SettingsPage.confirm.confirmLabel.odvezi
- FILE: src/SettingsPage.jsx
- KIND: confirm (confirmLabel)
- TEXT: Odveži

### SettingsPage.confirm.message.odvezati_google_nalog_za_kalendar
- KEY: SettingsPage.confirm.message.odvezati_google_nalog_za_kalendar
- FILE: src/SettingsPage.jsx
- KIND: confirm (message)
- TEXT: Odvezati Google nalog za kalendar?

### SettingsPage.confirm.title.odvezati_google
- KEY: SettingsPage.confirm.title.odvezati_google
- FILE: src/SettingsPage.jsx
- KIND: confirm (title)
- TEXT: Odvezati Google?

### SettingsPage.note.ako_bend_nema_kalendar_termini_koje_ti_sacuvas_i
- KEY: SettingsPage.note.ako_bend_nema_kalendar_termini_koje_ti_sacuvas_i
- FILE: src/SettingsPage.jsx
- KIND: note
- TEXT: Ako bend nema kalendar, termini koje TI sačuvaš idu u tvoj primary — ne u tuđe

### SettingsPage.note.svetla_ili_tamna
- KEY: SettingsPage.note.svetla_ili_tamna
- FILE: src/SettingsPage.jsx
- KIND: note
- TEXT: Svetla ili tamna

### SettingsPage.placeholder.dd_mm_yyyy
- KEY: SettingsPage.placeholder.dd_mm_yyyy
- FILE: src/SettingsPage.jsx
- KIND: placeholder
- TEXT: dd.mm.yyyy.

### SettingsPage.text.ako_bend_nema_kalendar_termini_koje_ti_sacuvas_i
- KEY: SettingsPage.text.ako_bend_nema_kalendar_termini_koje_ti_sacuvas_i
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Ako bend nema kalendar, termini koje TI sačuvaš idu u tvoj primary — ne u tuđe

### SettingsPage.text.bendovi
- KEY: SettingsPage.text.bendovi
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Bendovi

### SettingsPage.text.google_calendar_nije_konfigurisan_na_serveru_pro
- KEY: SettingsPage.text.google_calendar_nije_konfigurisan_na_serveru_pro
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Google Calendar nije konfigurisan na serveru. Proveri `.env` i restartuj API (`npm run dev` / PM2).

### SettingsPage.text.google_kalendar
- KEY: SettingsPage.text.google_kalendar
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Google kalendar

### SettingsPage.text.izgled
- KEY: SettingsPage.text.izgled
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Izgled

### SettingsPage.text.izgled_aplikacije_i_parametri_obracuna
- KEY: SettingsPage.text.izgled_aplikacije_i_parametri_obracuna
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Izgled aplikacije i parametri obračuna.

### SettingsPage.text.kurs_eur_rsd_od_21_07_2026
- KEY: SettingsPage.text.kurs_eur_rsd_od_21_07_2026
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Kurs EUR/RSD (od 21.07.2026.)

### SettingsPage.text.licni_sync
- KEY: SettingsPage.text.licni_sync
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Lični sync

### SettingsPage.text.obracun
- KEY: SettingsPage.text.obracun
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Obračun

### SettingsPage.text.obracun_do_datuma
- KEY: SettingsPage.text.obracun_do_datuma
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Obračun do datuma

### SettingsPage.text.odvezi_google_kalendar
- KEY: SettingsPage.text.odvezi_google_kalendar
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Odveži Google kalendar

### SettingsPage.text.odvojeno_od_prijave_google_om_ovde_dajes_dozvolu
- KEY: SettingsPage.text.odvojeno_od_prijave_google_om_ovde_dajes_dozvolu
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Odvojeno od prijave Google-om. Ovde daješ dozvolu da Chabar piše termine u kalendar. Kako radi: docs/google-calendar-sync.md

### SettingsPage.text.podesavanja
- KEY: SettingsPage.text.podesavanja
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Podešavanja

### SettingsPage.text.politika_kolacica
- KEY: SettingsPage.text.politika_kolacica
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Politika kolačića

### SettingsPage.text.politika_privatnosti
- KEY: SettingsPage.text.politika_privatnosti
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Politika privatnosti

### SettingsPage.text.pozivnice_u_bend
- KEY: SettingsPage.text.pozivnice_u_bend
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Pozivnice u bend

### SettingsPage.text.pozivnice_uvek_cekaju_tvoju_potvrdu_blokiraj_ako
- KEY: SettingsPage.text.pozivnice_uvek_cekaju_tvoju_potvrdu_blokiraj_ako
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Pozivnice uvek čekaju tvoju potvrdu. Blokiraj ako ne želiš da te iko pozove.

### SettingsPage.text.pravne_informacije
- KEY: SettingsPage.text.pravne_informacije
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Pravne informacije

### SettingsPage.text.pravno
- KEY: SettingsPage.text.pravno
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Pravno

### SettingsPage.text.proveravam
- KEY: SettingsPage.text.proveravam
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Proveravam…

### SettingsPage.text.svetla_ili_tamna
- KEY: SettingsPage.text.svetla_ili_tamna
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Svetla ili tamna

### SettingsPage.text.tema
- KEY: SettingsPage.text.tema
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Tema

### SettingsPage.text.uslovi_koriscenja
- KEY: SettingsPage.text.uslovi_koriscenja
- FILE: src/SettingsPage.jsx
- KIND: label
- TEXT: Uslovi korišćenja

### SettingsPage.toast.google_kalendar_odvezan
- KEY: SettingsPage.toast.google_kalendar_odvezan
- FILE: src/SettingsPage.jsx
- KIND: toast
- TEXT: Google kalendar odvezan

### SettingsPage.toast.izmena_nije_uspela
- KEY: SettingsPage.toast.izmena_nije_uspela
- FILE: src/SettingsPage.jsx
- KIND: toast
- TEXT: Izmena nije uspela

### SettingsPage.toast.licni_sync_iskljucen
- KEY: SettingsPage.toast.licni_sync_iskljucen
- FILE: src/SettingsPage.jsx
- KIND: toast
- TEXT: Lični sync isključen

### SettingsPage.toast.licni_sync_ukljucen
- KEY: SettingsPage.toast.licni_sync_ukljucen
- FILE: src/SettingsPage.jsx
- KIND: toast
- TEXT: Lični sync uključen

### SettingsPage.toast.odvezivanje_nije_uspelo
- KEY: SettingsPage.toast.odvezivanje_nije_uspelo
- FILE: src/SettingsPage.jsx
- KIND: toast
- TEXT: Odvezivanje nije uspelo

### SettingsPage.toast.povezivanje_nije_uspelo
- KEY: SettingsPage.toast.povezivanje_nije_uspelo
- FILE: src/SettingsPage.jsx
- KIND: toast
- TEXT: Povezivanje nije uspelo


## shared

### shared.invite.accept
- KEY: shared.invite.accept
- FILE: shared/bandLimits.js
- KIND: option
- TEXT: Dozvoli pozivnice

### shared.invite.block
- KEY: shared.invite.block
- FILE: shared/bandLimits.js
- KIND: option
- TEXT: Blokiraj pozivnice

### shared.invite.digest
- KEY: shared.invite.digest
- FILE: shared/bandLimits.js
- KIND: option
- TEXT: Dnevni pregled (uskoro)

### shared.role.lead
- KEY: shared.role.lead
- FILE: shared/roles.js
- KIND: option
- TEXT: lead

### shared.role.member
- KEY: shared.role.member
- FILE: shared/roles.js
- KIND: option
- TEXT: član

### shared.role.owner
- KEY: shared.role.owner
- FILE: shared/roles.js
- KIND: option
- TEXT: vlasnik


## UserMenu

### UserMenu.aria.nalog
- KEY: UserMenu.aria.nalog
- FILE: src/UserMenu.jsx
- KIND: aria
- TEXT: Nalog

### UserMenu.aria.nazad
- KEY: UserMenu.aria.nazad
- FILE: src/UserMenu.jsx
- KIND: aria
- TEXT: Nazad

### UserMenu.text.nalog
- KEY: UserMenu.text.nalog
- FILE: src/UserMenu.jsx
- KIND: label
- TEXT: Nalog

### UserMenu.text.nema_novih_pozivnica
- KEY: UserMenu.text.nema_novih_pozivnica
- FILE: src/UserMenu.jsx
- KIND: label
- TEXT: Nema novih pozivnica.

### UserMenu.text.null
- KEY: UserMenu.text.null
- FILE: src/UserMenu.jsx
- KIND: label
- TEXT: : null}

### UserMenu.text.pozivnice
- KEY: UserMenu.text.pozivnice
- FILE: src/UserMenu.jsx
- KIND: label
- TEXT: Pozivnice

### UserMenu.text.pozivnice_2
- KEY: UserMenu.text.pozivnice_2
- FILE: src/UserMenu.jsx
- KIND: label
- TEXT: Pozivnice
