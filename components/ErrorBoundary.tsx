import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '../services/sentryService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary 组件
 * 捕获子组件中的 JavaScript 错误，显示降级 UI，并上报到 Sentry
 *
 * 用法：
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 上报到 Sentry
    captureError(error, {
      componentStack: errorInfo.componentStack,
      category: 'react_error_boundary',
    });

    // 调用自定义错误处理器（如果有）
    this.props.onError?.(error, errorInfo);

    console.error('React Error Boundary caught error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // 使用自定义降级 UI（如果提供）
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认降级 UI
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-red-100 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                抱歉，页面遇到错误
              </h2>
            </div>

            <p className="text-slate-600 mb-6">
              应用程序遇到了意外错误。错误已自动上报，我们会尽快修复。
            </p>

            {this.state.error && (
              <details className="mb-6 text-sm">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700 mb-2">
                  查看错误详情
                </summary>
                <pre className="bg-slate-100 p-3 rounded-lg overflow-auto text-xs text-slate-700">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                重新尝试
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                刷新页面
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-6 text-center">
              如果问题持续存在，请联系技术支持或尝试清除浏览器缓存
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
