/** Placeholder rows while list data is loading (YouTube-style shell). */
export default function RasporedSkeleton({ rows = 8, variant = "schedule" }) {
  return (
    <ul className="raspored-list raspored-list-skeleton" aria-busy="true" aria-label="Učitavanje">
      {Array.from({ length: rows }, (_, index) => (
        <li
          key={index}
          className={`raspored-row raspored-row-skeleton ${
            variant === "finance" ? "raspored-row-finance" : ""
          } ${variant === "pay" ? "raspored-row-pay" : ""}`}
        >
          <span className="sk sk-date" />
          {variant === "pay" ? (
            <span className="sk sk-fee" />
          ) : (
            <>
              <div className="raspored-main">
                <span className="sk sk-line" />
                {variant === "schedule" ? <span className="sk sk-line sk-short" /> : null}
              </div>
              {variant === "finance" ? (
                <>
                  <span className="sk sk-chip" />
                  <span className="sk sk-icon" />
                  <span className="sk sk-fee" />
                </>
              ) : (
                <>
                  <span className="sk sk-band" />
                  <span className="sk sk-action" />
                </>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
