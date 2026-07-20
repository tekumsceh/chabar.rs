import { Component } from "react";

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
      return (
        <main className="app-crash" role="alert">
          <h1>Nešto nije u redu</h1>
          <p>Aplikacija se zaustavila. Osveži stranicu ili se vrati na početak.</p>
          <div className="app-crash-actions">
            <button type="button" onClick={() => window.location.assign("/")}>
              Početak
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Osveži
            </button>
          </div>
          <pre className="app-crash-detail">{String(this.state.error?.message || this.state.error)}</pre>
        </main>
      );
    }
    return this.props.children;
  }
}
