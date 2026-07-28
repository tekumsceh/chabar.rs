/**
 * Placeholder for in-app chat (band / members).
 */
export default function ChatPage() {
  return (
    <div className="chat-page">
      <header className="chat-page-header">
        <h1>Chat</h1>
        <p>Poruke sa bendom — uskoro.</p>
      </header>
      <div className="chat-page-empty" role="status">
        <span className="chat-page-empty-icon" aria-hidden="true">
          <ChatEmptyIcon />
        </span>
        <h2>Još nema chata</h2>
        <p>Ovde će ići razgovori po bendu. Za sada koristi komentare na terminima.</p>
      </div>
    </div>
  );
}

function ChatEmptyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 6.5h14a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2H10l-4.5 3.2V17H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
