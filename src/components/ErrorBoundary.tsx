import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from 'material/react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * The last line of defence: a render failure must become a readable page, not
 * a blank WebView. Data operations keep their own inline error states.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Expense Lens UI error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="page-state" role="alert">
        <span className="empty-icon" aria-hidden="true">
          <AlertTriangle size={28} />
        </span>
        <div className="empty-copy">
          <h2>界面遇到问题</h2>
          <p>当前页面无法渲染。数据仍保存在本地，重新加载后可继续使用。</p>
          <p className="form-error">{this.state.error.message}</p>
        </div>
        <Button variant="filled" onClick={() => window.location.reload()}>
          重新加载
        </Button>
      </div>
    );
  }
}
