import { useEffect, useId, useState } from "react";
import { bandInitials, resolveBandColor } from "./bandDisplay.js";
import FadeScroll from "./FadeScroll.jsx";
import {
  BackIcon,
  BellIcon,
  BandsIcon,
  ChevronRightIcon,
  InviteIcon,
  MoneyIcon,
  SettingsIcon,
  ShieldIcon,
  SignOutIcon,
} from "./appIcons.jsx";
import { formatEur } from "./calculations.js";
import { isBandLead } from "../shared/roles.js";
import { useT } from "./i18n/I18nProvider.jsx";

function getInitials(displayName, email) {
  const source = String(displayName || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function ProfileHub({
  open = false,
  onClose,
  email = "",
  displayName = "",
  avatarUrl = "",
  pendingInvites = [],
  notifications = [],
  bands = [],
  claimEur = 0,
  onAcceptInvite,
  onDeclineInvite,
  onOpenNotifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onOpenNotification,
  onOpenMoney,
  onOpenBand,
  onOpenSettings,
  onOpenLegal,
  onSignOut,
}) {
  const t = useT();
  const [view, setView] = useState("main");
  const [busyId, setBusyId] = useState("");
  const panelId = useId();

  const inviteCount = pendingInvites.length;
  const unreadNotifications = notifications.filter((item) => !item.readAt);
  const noticeCount = unreadNotifications.length;
  const showMoneyHint = claimEur > 0.005;

  useEffect(() => {
    if (!open) setView("main");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        if (view !== "main") setView("main");
        else onClose?.();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, view, onClose]);

  if (!open) return null;

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

  async function handleNoticeAction(notice) {
    setBusyId(notice.id);
    try {
      if (isNoticeViewable(notice)) await onOpenNotification?.(notice);
      else await onMarkNotificationRead?.(notice.id);
    } finally {
      setBusyId("");
    }
  }

  function goMain() {
    setView("main");
  }

  function closeAnd(action) {
    onClose?.();
    action?.();
  }

  return (
    <>
      <div className="profile-hub-backdrop" role="presentation" onClick={() => onClose?.()} />
      <div className="profile-hub-anchor">
        <div className="profile-hub" role="dialog" aria-modal="true" aria-label={t("profile.aria")} id={panelId}>
          {view === "main" ? (
            <>
              <header className="profile-hub-header">
                <div className="profile-hub-avatar" aria-hidden="true">
                  {avatarUrl ? (
                    <img className="profile-hub-avatar-img" src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="profile-hub-avatar-initials">{getInitials(displayName, email)}</span>
                  )}
                </div>
                <div className="profile-hub-user-text">
                  <p className="profile-hub-name">{displayName || email?.split("@")[0] || t("profile.title")}</p>
                  {email ? <p className="profile-hub-email">{email}</p> : null}
                </div>
              </header>

              <ul className="profile-hub-menu profile-hub-menu-main" role="menu" aria-label={t("profile.menu")}>
                <ProfileHubMenuItem
                  icon={<BellIcon />}
                  label={t("profile.notifications")}
                  badge={noticeCount}
                  onClick={() => {
                    setView("notices");
                    onOpenNotifications?.();
                  }}
                />
                <ProfileHubMenuItem
                  icon={<InviteIcon />}
                  label={t("profile.invites")}
                  badge={inviteCount}
                  onClick={() => setView("invites")}
                />
                <ProfileHubMenuItem
                  icon={<MoneyIcon />}
                  label={t("profile.money")}
                  hint={showMoneyHint ? t("profile.moneyClaimHint", { amount: formatEur(claimEur) }) : null}
                  onClick={() => closeAnd(onOpenMoney)}
                />
                <ProfileHubMenuItem
                  icon={<BandsIcon />}
                  label={t("profile.bands")}
                  onClick={() => setView("bands")}
                />
                <ProfileHubMenuItem
                  icon={<SettingsIcon />}
                  label={t("profile.settings")}
                  onClick={() => closeAnd(onOpenSettings)}
                />
              </ul>

              <div className="profile-hub-divider" role="presentation" />

              <ul className="profile-hub-menu profile-hub-menu-footer" role="menu" aria-label={t("settings.legal")}>
                <ProfileHubMenuItem
                  icon={<ShieldIcon />}
                  label={t("profile.legal")}
                  onClick={() => closeAnd(() => onOpenLegal?.("privacy"))}
                />
                <ProfileHubMenuItem
                  icon={<SignOutIcon />}
                  label={t("profile.signOut")}
                  tone="danger"
                  onClick={() => closeAnd(onSignOut)}
                />
              </ul>
            </>
          ) : (
            <>
              <div className="profile-hub-subhead">
                <button type="button" className="profile-hub-back" aria-label={t("common.back")} onClick={goMain}>
                  <BackIcon />
                </button>
                <p className="profile-hub-subtitle">
                  {view === "invites"
                    ? t("profile.invites")
                    : view === "notices"
                      ? t("profile.notifications")
                      : t("profile.bands")}
                </p>
                {view === "notices" && noticeCount > 0 ? (
                  <button
                    type="button"
                    className="profile-hub-subaction"
                    disabled={busyId === "all"}
                    onClick={async () => {
                      setBusyId("all");
                      try {
                        await onMarkAllNotificationsRead?.();
                      } finally {
                        setBusyId("");
                      }
                    }}
                  >
                    {t("profile.markRead")}
                  </button>
                ) : (
                  <span className="profile-hub-subaction-spacer" />
                )}
              </div>

              <FadeScroll className="fade-scroll-inset profile-hub-scroll">
                {view === "invites" ? (
                  pendingInvites.length === 0 ? (
                    <p className="profile-hub-empty">{t("profile.noInvites")}</p>
                  ) : (
                    <ul className="profile-hub-list">
                      {pendingInvites.map((invite) => (
                        <li key={invite.id} className="profile-hub-list-row">
                          <p className="profile-hub-list-copy">
                            <strong>{invite.bandName}</strong>
                            <span>{invite.invitedByName}</span>
                          </p>
                          <div className="profile-hub-list-actions">
                            <button
                              type="button"
                              className="profile-hub-accept"
                              disabled={busyId === invite.id}
                              onClick={() => handleAccept(invite.id)}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="profile-hub-decline"
                              disabled={busyId === invite.id}
                              onClick={() => handleDecline(invite.id)}
                            >
                              ✕
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}

                {view === "notices" ? (
                  notifications.length === 0 ? (
                    <p className="profile-hub-empty">{t("profile.noNotifications")}</p>
                  ) : (
                    <ul className="profile-hub-list">
                      {notifications.map((notice) => (
                        <li key={notice.id} className={`profile-hub-list-row ${notice.readAt ? "is-read" : ""}`}>
                          <p className="profile-hub-list-copy">
                            <strong>{notice.bandName || "Chabar"}</strong>
                            <span>{notice.message}</span>
                          </p>
                          {!notice.readAt ? (
                            <button
                              type="button"
                              className="profile-hub-notice-btn"
                              disabled={busyId === notice.id}
                              onClick={() => handleNoticeAction(notice)}
                            >
                              →
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}

                {view === "bands" ? (
                  bands.length === 0 ? (
                    <p className="profile-hub-empty">{t("profile.noBands")}</p>
                  ) : (
                    <ul className="profile-hub-band-list">
                      {bands.map((band) => {
                        const color = resolveBandColor(band, band.id);
                        const label =
                          band.kind === "personal" ? `${band.name} ${t("event.personalSuffix")}` : band.name;
                        const manage = isBandLead(band.memberRole);
                        return (
                          <li key={band.id}>
                            <button
                              type="button"
                              className="profile-hub-band-item"
                              onClick={() => closeAnd(() => onOpenBand?.(band.id))}
                            >
                              <span className="band-chip" style={{ backgroundColor: color }} aria-hidden="true">
                                {bandInitials(band.name)}
                              </span>
                              <span className="profile-hub-band-name">{label}</span>
                              <span className={`profile-hub-band-badge ${manage ? "is-manage" : ""}`}>
                                {manage ? "⚙" : "→"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : null}
              </FadeScroll>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ProfileHubMenuItem({ icon, label, badge = 0, hint = null, tone = "default", onClick }) {
  return (
    <li role="none">
      <button
        type="button"
        className={`profile-hub-item ${tone === "danger" ? "is-danger" : ""}`.trim()}
        role="menuitem"
        onClick={onClick}
      >
        <span className="profile-hub-item-icon">{icon}</span>
        <span className="profile-hub-item-body">
          <span className="profile-hub-item-label">{label}</span>
          {hint ? <span className="profile-hub-item-hint">{hint}</span> : null}
        </span>
        {badge > 0 ? <span className="profile-hub-item-badge">{badge}</span> : null}
        {tone === "danger" ? null : (
          <span className="profile-hub-item-chevron" aria-hidden="true">
            <ChevronRightIcon />
          </span>
        )}
      </button>
    </li>
  );
}

function isNoticeViewable(notice) {
  const payload = notice?.payload || {};
  return Boolean(
    notice?.eventId ||
      notice?.bandId ||
      notice?.page ||
      payload.eventId ||
      payload.bandId ||
      payload.page,
  );
}
