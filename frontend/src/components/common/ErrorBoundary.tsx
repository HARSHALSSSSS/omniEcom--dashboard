import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorPage } from "@/pages/error/ErrorPage";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component tree:", error, errorInfo);
    const msg = error?.message ?? "";
    if (
      msg.includes("error loading dynamically imported module") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Importing a module script failed")
    ) {
      const key = "boundary_chunk_retry";
      const lastRetry = sessionStorage.getItem(key);
      const now = Date.now();
      if (!lastRetry || now - Number(lastRetry) > 10000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorPage
          status={500}
          title="Something went wrong"
          description="An unexpected runtime error occurred while rendering this view. Your data is safe."
          error={this.state.error}
          onRetry={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}
