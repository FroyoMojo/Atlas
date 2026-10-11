// A rendering error shows a short recovery message instead of a blank page.
import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Atlas page error", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page" style={{ maxWidth: 560, paddingTop: 48 }}>
        <section className="card stack">
          <h2 className="section-title">Something went wrong on this page</h2>
          <p className="muted" style={{ margin: 0 }}>The data didn't load the way we expected. Reload to try again.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </section>
      </div>
    );
  }
}
