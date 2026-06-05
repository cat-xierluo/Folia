import { Component, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="editor-pane" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '24px',
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          textAlign: 'center',
        }}>
          <span>编辑器加载失败</span>
          <small style={{ fontSize: '11px', color: 'var(--border)', maxWidth: '400px', wordBreak: 'break-all' }}>
            {this.state.error?.message || '未知错误'}
          </small>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              marginTop: '8px',
              padding: '6px 16px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--surface)',
              color: 'var(--fg)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
