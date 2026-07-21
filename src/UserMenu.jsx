import { useEffect, useId, useRef, useState } from "react";

export default function UserMenu({
  email,
  displayName,
  avatarUrl,
  pendingInvites = [],
  notifications = [],
  onAcceptInvite,
  onDeclineInvite,
  onOpenNotifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onOpenSettings,
  onSignOut,
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("menu");
  const [busyId, setBusyId] = useState("");
  const rootRef = useRef(null);
  const menuId = useId();
  const label = displayName || email || "Nalog";
  const initials = getInitials(displayName, email);
  const inviteCount = pendingInvites.length;
  const unreadNotifications = notifications.filter((item) => !item.readAt);
  const noticeCount = unreadNotifications.length;
  const badgeCount = inviteCount + noticeCount;
  const hasBadge = badgeCount > 0;

  useEffect(() => {
    if (!open) {
      setView("menu");
      return undefined;
    }

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        if (view !== "menu") setView("menu");
        else setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, view]);

  async function handleAccept(inviteId) {
    setBusyId(inviteId);
    try {
      await onAcceptInvite?.(inviteId);
    } finally {
      setBusyId("");
    }
  }

  async function handleDecline(inviteId) {
    setBusyId(inviteId);
    try {
      await onDeclineInvite?.(inviteId);
    } finally {
      setBusyId("");
    }
  }

  async function openNotices() {
    setView("notices");
    onOpenNotifications?.();
  }

  async function handleMarkRead(id) {
    setBusyId(id);
    try {
      await onMarkNotificationRead?.(id);
    } finally {
      setBusyId("");
    }
  }

  async function handleMarkAllRead() {
    setBusyId("all");
    try {
      await onMarkAllNotificationsRead?.();
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className={`user-menu ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="user-avatar-btn"
        aria-label={hasBadge ? `Nalog, ${badgeCount} obaveštenja` : "Nalog"}
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
        {hasBadge ? <span className="user-avatar-dot" aria-hidden="true" /> : null}
      </button>

      {open ? (
        <div className="user-menu-panel" id={menuId} role="menu" aria-label="Nalog">
          {view === "invites" ? (
            <>
              <div className="user-menu-header user-menu-header-row">
                <button
                  type="button"
                  className="user-menu-back"
                  onClick={() => setView("menu")}
                  aria-label="Nazad"
                >
                  <BackIcon />
                </button>
                <p className="user-menu-name">Pozivnice</p>
              </div>

              {pendingInvites.length === 0 ? (
                <p className="user-menu-empty">Nema novih pozivnica.</p>
              ) : (
                <ul className="user-invite-list">
                  {pendingInvites.map((invite) => (
                    <li key={invite.id} className="user-invite-row">
                      <p className="user-invite-copy">
                        <strong>{invite.bandName}</strong>
                        <span>{invite.invitedByName} te poziva da se pridružiš</span>
                      </p>
                      <div className="user-invite-actions">
                        <button
                          type="button"
                          className="invite-accept"
                          disabled={busyId === invite.id}
                          onClick={() => handleAccept(invite.id)}
                        >
                          Prihvati
                        </button>
                        <button
                          type="button"
                          className="invite-decline"
                          disabled={busyId === invite.id}
                          onClick={() => handleDecline(invite.id)}
                        >
                          Odbij
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : view === "notices" ? (
            <>
              <div className="user-menu-header user-menu-header-row">
                <button
                  type="button"
                  className="user-menu-back"
                  onClick={() => setView("menu")}
                  aria-label="Nazad"
                >
                  <BackIcon />
                </button>
                <p className="user-menu-name">Obaveštenja</p>
              </div>

              {noticeCount > 0 ? (
                <div className="user-menu-notice-toolbar">
                  <button
                    type="button"
                    className="user-menu-mark-all"
                    disabled={busyId === "all"}
                    onClick={handleMarkAllRead}
                  >
                    Označi sve pročitano
                  </button>
                </div>
              ) : null}

              {notifications.length === 0 ? (
                <p className="user-menu-empty">Nema obaveštenja.</p>
              ) : (
                <ul className="user-invite-list">
                  {notifications.map((notice) => (
                    <li
                      key={notice.id}
                      className={`user-invite-row user-notice-row ${notice.readAt ? "is-read" : ""}`}
                    >
                      <p className="user-invite-copy">
                        <strong>{notice.bandName || "Bend"}</strong>
                        <span>{notice.message}</span>
                      </p>
                      {!notice.readAt ? (
                        <div className="user-invite-actions">
                          <button
                            type="button"
                            className="invite-accept"
                            disabled={busyId === notice.id}
                            onClick={() => handleMarkRead(notice.id)}
                          >
                            U redu
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
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
                    className="user-menu-item user-menu-item-invites"
                    role="menuitem"
                    onClick={() => setView("invites")}
                  >
                    <span>Pozivnice</span>
                    {inviteCount ? <span className="user-menu-count">{inviteCount}</span> : null}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="user-menu-item user-menu-item-invites"
                    role="menuitem"
                    onClick={openNotices}
                  >
                    <span>Obaveštenja</span>
                    {noticeCount ? <span className="user-menu-count">{noticeCount}</span> : null}
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
            </>
          )}
        </div>
      ) : null}
    </div>
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
