import { Component, type ErrorInfo, type ReactNode } from "react";

import { UsherMark } from "./usher/UsherMark";

type Props = {
  children: ReactNode;
  variant?: "page" | "panel";
  label?: string;
  resetKey?: string | number;
  onRetry?: () => void;
};

type State = { error: Error | null; resetKey: string | number | undefined };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Pick<State, "error"> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    if (props.resetKey === state.resetKey) {
      return null;
    }

    return { error: null, resetKey: props.resetKey };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Marquee crashed in ${this.props.label ?? "the building"}`,
      error,
      info.componentStack,
    );
  }

  private readonly retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    if (this.props.variant === "page") {
      return (
        <section className="page-section">
          <div className="search-empty lost">
            <UsherMark face="unimpressed" crop="head" />
            <h2>The reel snapped.</h2>
            <p>
              Something in {this.props.label ?? "here"} came apart mid-showing. I have swept it up.
              Thread it again, or go back to tonight.
            </p>
            <div className="lost-actions">
              <button type="button" className="button-link" onClick={this.retry}>
                Thread it again
              </button>
              <a className="lost-aside" href="/">
                Back to tonight
              </a>
            </div>
          </div>
        </section>
      );
    }

    return (
      <div className="boundary-panel" role="alert">
        <p>
          <strong>{this.props.label ?? "This part"} came off in my hands.</strong> The rest of the
          page is fine.
        </p>
        <button type="button" onClick={this.retry}>
          Try it again
        </button>
      </div>
    );
  }
}
