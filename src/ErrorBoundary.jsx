import { Component } from "react";
import FadeScroll from "./FadeScroll.jsx";
import { LOCALE_KEY } from "./i18n/I18nProvider.jsx";
import { DEFAULT_LOCALE, translate } from "./i18n/messages.js";

function currentLocale() {
  try {
    const stored = String(localStorage.getItem(LOCALE_KEY) || "").trim();
    if (stored === "en" || stored === "sr") return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App crash", error, info);
  }

  render() {
    if (this.state.error) {
      const t = (key) => translate(currentLocale(), key);
      return (
        <main className="app-crash" role="alert">
          <h1>{t("error.boundary")}</h1>
          <p>{t("error.boundaryHint")}</p>
          <div className="app-crash-actions">
            <button type="button" onClick={() => window.location.assign("/")}>
              {t("error.home")}
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              {t("error.reload")}
            </button>
          </div>
          <FadeScroll className="fade-scroll-inset app-crash-detail-scroll">
            <pre className="app-crash-detail">{String(this.state.error?.message || this.state.error)}</pre>
          </FadeScroll>
        </main>
      );
    }
    return this.props.children;
  }
}
