import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

import { Button, Callout, EmptyState, ExternalTextLink, Page, Text } from "../ui";
import { UsherMark } from "./usher/UsherMark";

import styles from "./ErrorBoundary.module.css";

type Props = {
  children: ReactNode;
  variant?: "page" | "panel";
  compact?: boolean;
  label?: string;
  resetKey?: string | number;
  onRetry?: () => void;
};

type State = {
  error: Error | null;
  resetKey: string | number | undefined;
  retryCount: number;
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    error: null,
    resetKey: this.props.resetKey,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error): Pick<State, "error"> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    if (props.resetKey === state.resetKey) {
      return null;
    }

    return {
      error: null,
      resetKey: props.resetKey,
      retryCount: state.retryCount,
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Marquee crashed in ${this.props.label ?? "the building"}`,
      error,
      info.componentStack,
    );
  }

  private readonly retry = () => {
    this.setState((state) => ({
      error: null,
      retryCount: state.retryCount + 1,
    }));
    this.props.onRetry?.();
  };

  override render() {
    if (!this.state.error) {
      return <Fragment key={this.state.retryCount}>{this.props.children}</Fragment>;
    }

    if (this.props.variant === "page") {
      return (
        <Page>
          <EmptyState
            mark={<UsherMark face="unimpressed" crop="head" className={styles.mark} />}
            heading="The reel snapped."
            description={`Something in ${this.props.label ?? "here"} came apart mid-showing. I have swept it up. Thread it again, or go back to tonight.`}
            actions={
              <>
                <Button variant="primary" size="lg" onClick={this.retry}>
                  Thread it again
                </Button>
                <ExternalTextLink href="/" target="_self" rel="" variant="aside">
                  Back to tonight
                </ExternalTextLink>
              </>
            }
          />
        </Page>
      );
    }

    return (
      <Callout
        className={this.props.compact ? styles.compact : styles.panel}
        actions={
          <Button variant="danger" size="lg" onClick={this.retry}>
            Try it again
          </Button>
        }
      >
        <Text as="span">
          <strong className={styles.lead}>
            {this.props.label ?? "This part"} came off in my hands.
          </strong>{" "}
          The rest of the page is fine.
        </Text>
      </Callout>
    );
  }
}
