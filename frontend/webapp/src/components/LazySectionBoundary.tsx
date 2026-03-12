import { Component, type ErrorInfo, type ReactNode } from 'react';

interface LazySectionBoundaryProps {
  title: string;
  description: string;
  children: ReactNode;
  reloadLabel?: string;
}

interface LazySectionBoundaryState {
  error: Error | null;
}

export class LazySectionBoundary extends Component<LazySectionBoundaryProps, LazySectionBoundaryState> {
  state: LazySectionBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): LazySectionBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Lazy section render failed.', error, errorInfo);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    const { children, description, reloadLabel = '刷新页面', title } = this.props;
    const { error } = this.state;

    if (!error) {
      return children;
    }

    return (
      <article className="panel empty-panel loading-panel">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
          <p>{error.message || '资源加载失败，请刷新后重试。'}</p>
          <button className="scene-action" onClick={this.handleReload} type="button">
            {reloadLabel}
          </button>
        </div>
      </article>
    );
  }
}
