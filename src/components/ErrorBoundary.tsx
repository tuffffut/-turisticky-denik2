import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
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
    console.error('Neodchycená chyba v aplikaci:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-stone-900 border border-red-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
            <div className="w-14 h-14 bg-red-950/80 border border-red-700/80 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-400">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Nastala neočekávaná chyba</h2>
            <p className="text-xs text-red-300 mb-6 bg-red-950/50 p-3 rounded-xl border border-red-900/60 font-mono text-left break-words">
              {this.state.error?.message || 'Neznámá chyba při zobrazení'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow"
            >
              <RefreshCw className="w-4 h-4" />
              Obnovit aplikaci
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
