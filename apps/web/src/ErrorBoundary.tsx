import { Component, ErrorInfo, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[web] unhandled render error", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app">
          <div className="card stack">
            <h1 className="app-title">Boltorezka</h1>
            <p>UI crashed unexpectedly. Please reload and try again.</p>
            <div className="row">
              <button type="button" onClick={this.handleReload}>
                Reload UI
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
