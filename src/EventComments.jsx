import { useEffect, useState } from "react";
import { api } from "./api.js";
import FadeScroll from "./FadeScroll.jsx";
import { useT } from "./i18n/I18nProvider.jsx";

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Thorough local stamp: 21.07.2026. 14:55 */
export function formatDatedStamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}. ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Append-only dated comments for an event (works on past locked gigs).
 */
export default function EventComments({ eventId, bandId, showToast, compact = false }) {
  const t = useT();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!eventId || !bandId) {
        setComments([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await api(`/api/events/${eventId}/comments`, { bandId });
        if (!cancelled) setComments(data.comments || []);
      } catch (error) {
        if (!cancelled) {
          setComments([]);
          showToast?.(error.message || t("comments.loadFail"), "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, bandId]);

  async function submit(event) {
    event.preventDefault();
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const created = await api(`/api/events/${eventId}/comments`, {
        method: "POST",
        bandId,
        body: { body: text },
      });
      setComments((current) => [...current, created]);
      setBody("");
      showToast?.(t("comments.added"));
    } catch (error) {
      showToast?.(error.message || t("comments.saveFail"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`event-comments ${compact ? "is-compact" : ""}`}>
      <h3 className="event-comments-title">{t("comments.title")}</h3>
      {loading ? (
        <p className="event-comments-empty">{t("comments.loading")}</p>
      ) : comments.length === 0 ? (
        <p className="event-comments-empty">{t("comments.empty")}</p>
      ) : (
        <FadeScroll className="fade-scroll-inset event-comments-scroll">
          <ul className="event-comments-list">
            {comments.map((comment) => (
              <li key={comment.id} className="event-comments-item">
                <div className="event-comments-meta">
                  <strong>{comment.authorName || t("comments.authorFallback")}</strong>
                  <time dateTime={comment.createdAt}>{formatDatedStamp(comment.createdAt)}</time>
                </div>
                <p className="event-comments-body">{comment.body}</p>
              </li>
            ))}
          </ul>
        </FadeScroll>
      )}
      <form className="event-comments-form" onSubmit={submit}>
        <label className="sr-only" htmlFor={`event-comment-${eventId}`}>
          {t("comments.newComment")}
        </label>
        <textarea
          id={`event-comment-${eventId}`}
          name={`event-comment-${eventId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={compact ? 2 : 3}
          placeholder={t("comments.placeholder")}
          disabled={saving || !eventId}
        />
        <button type="submit" disabled={saving || !body.trim()}>
          {saving ? t("common.saving") : t("comments.add")}
        </button>
      </form>
    </div>
  );
}
