/**
 * Placeholder legal documents — content TBD; routes/pages ready for store / GDPR.
 * types: terms | privacy | cookies | imprint
 */

const DOCS = {
  terms: {
    title: "Uslovi korišćenja",
    summary: "Pravila korišćenja Chabar platforme.",
  },
  privacy: {
    title: "Politika privatnosti",
    summary: "Kako prikupljamo i koristimo lične podatke.",
  },
  cookies: {
    title: "Politika kolačića",
    summary: "Kolačići i slične tehnologije na sajtu.",
  },
  imprint: {
    title: "Pravne informacije",
    summary: "Izdavač, kontakt i osnovni pravni podaci.",
  },
};

export const LEGAL_PAGE_IDS = Object.keys(DOCS);

export function isLegalPage(page) {
  return LEGAL_PAGE_IDS.includes(page);
}

export default function LegalPage({ pageId = "terms", onBack }) {
  const doc = DOCS[pageId] || DOCS.terms;

  return (
    <main className="legal-page">
      <header className="legal-header">
        {onBack ? (
          <button type="button" className="legal-back" onClick={onBack} aria-label="Nazad">
            <BackIcon />
            <span>Nazad</span>
          </button>
        ) : null}
        <h1>{doc.title}</h1>
        <p>{doc.summary}</p>
      </header>

      <article className="legal-body panel">
        <p className="legal-placeholder">
          Sadržaj ove stranice biće dopunjen. Stranica je pripremljena zbog zakonskih zahteva (prodavnice
          aplikacija, privatnost, uslovi korišćenja).
        </p>
      </article>
    </main>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M15 6 9 12l6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
