import { useEffect, useId, useRef, useState } from "react";

/**
 * Avatar button with account dropdown.
 * Settings + logout are active; Nalog stays a placeholder.
 */
export default function UserMenu({ email, displayName, avatarUrl, onOpenSettings, onSignOut }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const label = displayName || email || "Nalog";
  const initials = getInitials(displayName, email);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`user-menu ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="user-avatar-btn"
        aria-label="Nalog"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={label}
        onClick={() => setOpen((current) => !current)}
      >
        {avatarUrl ? (
          <img className="user-avatar-img" src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="user-avatar-initials" aria-hidden="true">
            {initials}
          </span>
        )}
      </button>

      {open ? (
        <div className="user-menu-panel" id={menuId} role="menu" aria-label="Nalog">
          <div className="user-menu-header">
            <p className="user-menu-name">{displayName || email?.split("@")[0] || "Korisnik"}</p>
            {email ? <p className="user-menu-email">{email}</p> : null}
          </div>

          <ul className="user-menu-list">
            <li>
              <button type="button" className="user-menu-item" role="menuitem" disabled>
                Nalog
              </button>
            </li>
            <li>
              <button
                type="button"
                className="user-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings?.();
                }}
              >
                Podešavanja
              </button>
            </li>
          </ul>

          <div className="user-menu-sep" />

          <button
            type="button"
            className="user-menu-item user-menu-item-danger"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await onSignOut();
            }}
          >
            Odjava
          </button>
        </div>
      ) : null}
    </div>
  );
}

function getInitials(displayName, email) {
  const source = String(displayName || email || "?").trim();
  if (!source) return "?";

  const parts = source.includes("@")
    ? [source.split("@")[0]]
    : source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}
