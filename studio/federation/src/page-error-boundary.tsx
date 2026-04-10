import { Component, type ReactNode, type ErrorInfo } from 'react';
import { PluginErrorUI } from './plugin-error-ui.js';

interface Props {
  pageId: string;
  pluginId: string;
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that isolates plugin page runtime crashes.
 * A crashed plugin does NOT bring down the rest of Studio.
 */
export class PageErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `[PageErrorBoundary] Plugin "${this.props.pluginId}" page "${this.props.pageId}" crashed:`,
      error,
      errorInfo,
    );
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <PluginErrorUI
          type="crash"
          pluginId={this.props.pluginId}
          pageId={this.props.pageId}
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}
