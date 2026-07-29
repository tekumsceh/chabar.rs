import { BackIcon } from "./appIcons.jsx";

/** Secondary pages — icon back + short title */
export default function PageHeader({ title, onBack, children = null }) {
  return (
    <header className="page-header">
      <button type="button" className="page-header-back" aria-label="Nazad" title="Nazad" onClick={onBack}>
        <BackIcon />
      </button>
      <h1 className="page-header-title">{title}</h1>
      {children ? <div className="page-header-trail">{children}</div> : null}
    </header>
  );
}
