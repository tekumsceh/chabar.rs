import { useEffect, useState } from "react";
import { api } from "./api.js";

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
          showToast?.(error.message || "Komentari nisu učitani", "error");
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
      showToast?.("Komentar dodat");
    } catch (error) {
      showToast?.(error.message || "Komentar nije sačuvan", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`event-comments ${compact ? "is-compact" : ""}`}>
      <h3 className="event-comments-title">Komentari</h3>
      {loading ? (
        <p className="event-comments-empty">Učitavanje…</p>
      ) : comments.length === 0 ? (
        <p className="event-comments-empty">Nema komentara još.</p>
      ) : (
        <ul className="event-comments-list">
          {comments.map((comment) => (
            <li key={comment.id} className="event-comments-item">
              <div className="event-comments-meta">
                <strong>{comment.authorName || "Korisnik"}</strong>
                <time dateTime={comment.createdAt}>{formatDatedStamp(comment.createdAt)}</time>
              </div>
              <p className="event-comments-body">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="event-comments-form" onSubmit={submit}>
        <label className="sr-only" htmlFor={`event-comment-${eventId}`}>
          Novi komentar
        </label>
        <textarea
          id={`event-comment-${eventId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={compact ? 2 : 3}
          placeholder="Dodaj komentar (datum i autor se upisuju automatski)…"
          disabled={saving || !eventId}
        />
        <button type="submit" disabled={saving || !body.trim()}>
          {saving ? "Čuvam…" : "Dodaj komentar"}
        </button>
      </form>
    </div>
  );
}
