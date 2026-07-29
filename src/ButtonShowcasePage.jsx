import PageHeader from "./PageHeader.jsx";
import { ChevronRightIcon } from "./appIcons.jsx";

const DESIGNS = [
  {
    id: "aether",
    name: "Aether",
    tag: "Staklo · pill",
    note: "Providno, tanak obrub — bez belog bloka.",
    primaryClass: "cb-btn cb-btn-aether",
    secondaryClass: "cb-btn cb-btn-aether cb-btn-aether-soft",
  },
  {
    id: "ink",
    name: "Ink",
    tag: "Solid · premium",
    note: "Pun ink fill — jasan primarni, kompaktan.",
    primaryClass: "cb-btn cb-btn-ink",
    secondaryClass: "cb-btn cb-btn-ink cb-btn-ink-soft",
  },
  {
    id: "pulse",
    name: "Pulse",
    tag: "Gradient · brand",
    note: "Blagi gradijent brenda, savremen CTA.",
    primaryClass: "cb-btn cb-btn-pulse",
    secondaryClass: "cb-btn cb-btn-pulse cb-btn-pulse-soft",
  },
  {
    id: "wire",
    name: "Wire",
    tag: "Outline · hairline",
    note: "Samo linija — lagan sekundarni, ne guši UI.",
    primaryClass: "cb-btn cb-btn-wire cb-btn-wire-strong",
    secondaryClass: "cb-btn cb-btn-wire",
  },
  {
    id: "mist",
    name: "Mist",
    tag: "Tint · soft",
    note: "Brand na 12% — bez grubog belog panela.",
    primaryClass: "cb-btn cb-btn-mist",
    secondaryClass: "cb-btn cb-btn-mist cb-btn-mist-neutral",
  },
  {
    id: "glow",
    name: "Glow",
    tag: "Neon · ring",
    note: "Tamna baza + neon prsten — Chabar noć.",
    primaryClass: "cb-btn cb-btn-glow",
    secondaryClass: "cb-btn cb-btn-glow cb-btn-glow-soft",
  },
  {
    id: "compact",
    name: "Compact",
    tag: "32px · gust",
    note: "Niži, užiji — za toolbare i forme.",
    primaryClass: "cb-btn cb-btn-compact cb-btn-compact-brand",
    secondaryClass: "cb-btn cb-btn-compact",
  },
  {
    id: "chip",
    name: "Chip",
    tag: "Pill · xs",
    note: "Mali pill za filtere i brze radnje.",
    primaryClass: "cb-btn cb-btn-chip cb-btn-chip-brand",
    secondaryClass: "cb-btn cb-btn-chip",
  },
  {
    id: "ghost",
    name: "Ghost",
    tag: "Text · zero fill",
    note: "Bez pozadine — samo tekst i hover.",
    primaryClass: "cb-btn cb-btn-ghost cb-btn-ghost-strong",
    secondaryClass: "cb-btn cb-btn-ghost",
  },
  {
    id: "lift",
    name: "Lift",
    tag: "Surface · hover shadow",
    note: "Tanki panel + senka na hover, ne stalno.",
    primaryClass: "cb-btn cb-btn-lift cb-btn-lift-brand",
    secondaryClass: "cb-btn cb-btn-lift",
  },
];

export default function ButtonShowcasePage({ onBack }) {
  return (
    <div className="settings-page btn-showcase-page">
      <PageHeader title="Dugmad" onBack={onBack} />

      <p className="btn-showcase-lead">
        <strong>Mist</strong> je sada podrazumevani stil u celoj app. Ispod su sve varijante za poređenje — primarni, sekundarni, ikona.
      </p>

      <section className="btn-showcase-card btn-showcase-legacy" aria-label="Stari solid stil">
        <div className="btn-showcase-card-head">
          <span className="btn-showcase-num">—</span>
          <div>
            <h2>Stari solid (referenca)</h2>
            <p>Pun brand fill — zamenjeno Mist tintom.</p>
          </div>
        </div>
        <div className="btn-showcase-row">
          <button type="button" className="btn-showcase-legacy-solid">Sačuvaj</button>
          <button type="button" className="btn-showcase-legacy-secondary">Otkaži</button>
        </div>
      </section>

      <section className="btn-showcase-card btn-showcase-legacy" aria-label="Trenutni Mist">
        <div className="btn-showcase-card-head">
          <span className="btn-showcase-num">✓</span>
          <div>
            <h2>Trenutno — Mist</h2>
            <p>Globalni <code>button</code> + sekundarni iz formi.</p>
          </div>
        </div>
        <div className="btn-showcase-row">
          <button type="button">Sačuvaj</button>
          <button type="button" className="termin-form-secondary">
            Otkaži
          </button>
          <button type="button" className="termin-form-ghost">
            Preskoči
          </button>
        </div>
        <div className="btn-showcase-row btn-showcase-row-context">
          <div className="btn-showcase-mock-field">
            <span className="btn-showcase-mock-label">Grad</span>
            <span className="btn-showcase-mock-value">Beograd</span>
          </div>
          <button type="button">Dodaj termin</button>
        </div>
      </section>

      <div className="btn-showcase-grid">
        {DESIGNS.map((design, index) => (
          <DesignCard key={design.id} design={design} index={index + 1} />
        ))}
      </div>
    </div>
  );
}

function DesignCard({ design, index }) {
  return (
    <article className="btn-showcase-card" id={`btn-design-${design.id}`}>
      <div className="btn-showcase-card-head">
        <span className="btn-showcase-num">{String(index).padStart(2, "0")}</span>
        <div>
          <h2>
            {design.name}
            <span className="btn-showcase-tag">{design.tag}</span>
          </h2>
          <p>{design.note}</p>
        </div>
      </div>

      <div className="btn-showcase-row">
        <button type="button" className={design.primaryClass}>
          Sačuvaj
        </button>
        <button type="button" className={design.secondaryClass}>
          Otkaži
        </button>
        <button type="button" className={`${design.secondaryClass} cb-btn-icon-trail`}>
          Dalje
          <ChevronRightIcon />
        </button>
      </div>

      <div className="btn-showcase-row btn-showcase-row-context">
        <div className="btn-showcase-mock-field">
          <span className="btn-showcase-mock-label">Grad</span>
          <span className="btn-showcase-mock-value">Niš</span>
        </div>
        <button type="button" className={design.primaryClass}>
          Dodaj
        </button>
      </div>

      <div className="btn-showcase-row btn-showcase-row-states">
        <button type="button" className={design.primaryClass} disabled>
          Disabled
        </button>
        <button type="button" className={`${design.primaryClass} cb-btn-danger`}>
          Obriši
        </button>
      </div>
    </article>
  );
}
