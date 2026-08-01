import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useT } from "./i18n/I18nProvider.jsx";

function formatInputCh(index) {
  return String(index + 1).padStart(2, "0");
}

function formatOutputCh(index) {
  return String(index + 1).padStart(2, "0");
}

function cell(value) {
  const text = String(value || "").trim();
  return text || "—";
}

export default function TechRiderSheet({
  open,
  onClose,
  inputs = [],
  outputs = [],
  notes = "",
}) {
  const t = useT();
  const notesText = String(notes || "").trim();

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="tech-rider-sheet" role="dialog" aria-modal="true" aria-label={t("tech.sheet.title")}>
      <button
        type="button"
        className="tech-rider-sheet-back"
        aria-label={t("common.back")}
        title={t("common.back")}
        onClick={onClose}
      >
        <SheetBackIcon />
      </button>

      <div className="tech-rider-sheet-scroller">
        <div className="tech-rider-sheet-page">
          {notesText ? (
            <section className="tech-rider-sheet-notes" aria-label={t("tech.notes")}>
              <h1>{t("tech.notes")}</h1>
              <p>{notesText}</p>
            </section>
          ) : null}

          {inputs.length ? (
            <table className="tech-rider-sheet-table is-input">
              <caption>{t("tech.sheet.inputs")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("tech.col.ch")}</th>
                  <th scope="col">{t("tech.col.source")}</th>
                  <th scope="col">{t("tech.col.gear")}</th>
                  <th scope="col">{t("tech.col.hardware")}</th>
                </tr>
              </thead>
              <tbody>
                {inputs.map((row, index) => (
                  <tr key={row.id || `in-${index}`}>
                    <td className="tech-rider-sheet-ch">{formatInputCh(index)}</td>
                    {row.isEmpty ? (
                      <>
                        <td>{t("tech.emptyBadge")}</td>
                        <td>—</td>
                        <td>—</td>
                      </>
                    ) : (
                      <>
                        <td>{cell(row.label)}</td>
                        <td>{cell(row.gear)}</td>
                        <td>{cell(row.hardware)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="tech-rider-sheet-block">
              <p className="tech-rider-sheet-caption">{t("tech.sheet.inputs")}</p>
              <p className="tech-rider-sheet-empty">{t("tech.sheet.noInputs")}</p>
            </div>
          )}

          {outputs.length ? (
            <table className="tech-rider-sheet-table is-output">
              <caption>{t("tech.sheet.outputs")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("tech.col.ch")}</th>
                  <th scope="col">{t("tech.col.destination")}</th>
                  <th scope="col">{t("tech.col.gear")}</th>
                  <th scope="col">{t("tech.col.stereo")}</th>
                  <th scope="col">{t("tech.col.level")}</th>
                </tr>
              </thead>
              <tbody>
                {outputs.map((row, index) => (
                  <tr key={row.id || `out-${index}`}>
                    <td className="tech-rider-sheet-ch">{formatOutputCh(index)}</td>
                    {row.isEmpty ? (
                      <>
                        <td>{t("tech.emptyBadge")}</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                      </>
                    ) : (
                      <>
                        <td>{cell(row.label)}</td>
                        <td>{cell(row.gear)}</td>
                        <td>{row.stereo ? "ST" : "—"}</td>
                        <td>
                          {row.levelDb != null && row.levelDb !== "" ? `${Number(row.levelDb)} dB` : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="tech-rider-sheet-block">
              <p className="tech-rider-sheet-caption">{t("tech.sheet.outputs")}</p>
              <p className="tech-rider-sheet-empty">{t("tech.sheet.noOutputs")}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SheetBackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SheetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none">
      <path
        d="M7 3.5h7.5L19 8v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 3.5V8h5M9 12h6M9 15.5h6M9 19h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
