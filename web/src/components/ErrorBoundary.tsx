// A rendering error shows a short recovery message instead of a blank page. It clears itself when
// `resetKey` changes (the route), so one broken page does not leave every later tab broken.
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  resetKey?: string;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Atlas page error", error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page" style={{ maxWidth: 560, paddingTop: 48 }}>
        <section className="card stack">
          <h2 className="section-title">Something went wrong on this page</h2>
          <p className="muted" style={{ margin: 0 }}>The data didn't load the way we expected. Try another tab, or reload.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </section>
      </div>
    );
  }
}
