import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface World3DErrorBoundaryProps {
  children: ReactNode;
}

interface World3DErrorBoundaryState {
  hasError: boolean;
}

/**
 * Crash net around the World 3D tree: a render-time exception degrades to a
 * visible panel instead of a white screen. Effect-time failures (shell build)
 * are caught at their call sites in World3D — this catches the rest.
 */
export class World3DErrorBoundary extends Component<World3DErrorBoundaryProps, World3DErrorBoundaryState> {
  state: World3DErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): Partial<World3DErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('world3d render failed', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-950/90 p-6">
          <div className="max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-5 text-center shadow-lg">
            <h2 className="text-sm font-semibold text-slate-100">3D view hit a snag</h2>
            <p className="mt-1 text-xs text-slate-400">The scene hit an unexpected error.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-600"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
