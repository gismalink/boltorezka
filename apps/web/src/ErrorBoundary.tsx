import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./components/uicomponents";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string;
  componentStack: string;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: "", componentStack: "" };

  static getDerivedStateFromError(): State {
    return { hasError: true, errorMessage: "", componentStack: "" };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[web] unhandled render error", error, info);

    const message = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
    const componentStack = String(info?.componentStack || "").trim();

    this.setState({
      hasError: true,
      errorMessage: message,
      componentStack
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app" data-testid="error-boundary-fallback">
          <div className="card stack">
            <h1 className="app-title">Datute</h1>
            <p>UI crashed unexpectedly. Please reload and try again.</p>
            {this.state.errorMessage ? (
              <p className="muted" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                Error: {this.state.errorMessage}
              </p>
            ) : null}
            {this.state.componentStack ? (
              <pre className="muted" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto" }}>
                {this.state.componentStack}
              </pre>
            ) : null}
            <div className="row">
              <Button type="button" onClick={this.handleReload}>
                Reload UI
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
