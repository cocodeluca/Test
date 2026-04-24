import React from 'react';

const EMERGENCY_SAFE_MODE = true;

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[render-crash]', error.message, errorInfo.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-stone-100 px-6 text-center text-slate-800">
          <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold">App failed to render</h1>
            <p className="mt-3 text-sm text-slate-600">{this.state.error.message}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
              Emergency safe mode is available
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => {
                  const url = new URL(window.location.href);
                  if (!EMERGENCY_SAFE_MODE) {
                    url.searchParams.set('safe-mode', '1');
                  }
                  window.location.assign(url.toString());
                }}
              >
                Reload in Safe Mode
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
