import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

const ConfirmContext = createContext(null);

/**
 * App-wide confirm / alert dialogs (replaces window.confirm / window.alert).
 * Usage: const { confirm, alert } = useConfirm();
 *   const ok = await confirm({ title, message, danger, confirmLabel, cancelLabel });
 *   await alert({ title, message });
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const confirmBtnRef = useRef(null);

  const settle = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolve?.(result);
  }, []);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      if (resolverRef.current) resolverRef.current(false);
      resolverRef.current = resolve;
      setDialog({
        mode: "confirm",
        title: options.title || "Potvrda",
        message: options.message || "",
        confirmLabel: options.confirmLabel || "Potvrdi",
        cancelLabel: options.cancelLabel || "Otkaži",
        danger: Boolean(options.danger),
      });
    });
  }, []);

  const alert = useCallback((options = {}) => {
    return new Promise((resolve) => {
      if (resolverRef.current) resolverRef.current(false);
      resolverRef.current = () => resolve();
      setDialog({
        mode: "alert",
        title: options.title || "Obaveštenje",
        message: options.message || "",
        confirmLabel: options.confirmLabel || "U redu",
        cancelLabel: "",
        danger: false,
      });
    });
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    confirmBtnRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        settle(dialog.mode === "alert" ? undefined : false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog, settle]);

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog ? (
        <div
          className="modal-backdrop confirm-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              settle(dialog.mode === "alert" ? undefined : false);
            }
          }}
        >
          <div
            className={`modal-panel confirm-panel ${dialog.danger ? "is-danger" : ""}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={dialog.message ? descId : undefined}
          >
            <div className="confirm-body">
              <h2 id={titleId} className="confirm-title">
                {dialog.title}
              </h2>
              {dialog.message ? (
                <p id={descId} className="confirm-message">
                  {dialog.message}
                </p>
              ) : null}
            </div>
            <div className="confirm-actions">
              {dialog.mode === "confirm" ? (
                <button type="button" className="confirm-btn confirm-btn-ghost" onClick={() => settle(false)}>
                  {dialog.cancelLabel}
                </button>
              ) : null}
              <button
                type="button"
                ref={confirmBtnRef}
                className={`confirm-btn ${dialog.danger ? "confirm-btn-danger" : "confirm-btn-primary"}`}
                onClick={() => settle(dialog.mode === "alert" ? undefined : true)}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm mora biti unutar ConfirmProvider");
  }
  return ctx;
}
