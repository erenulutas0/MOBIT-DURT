import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

type Props = {
  /** Label shown in the fallback and used to reset the boundary when the tab changes. */
  tabKey: string;
  children: ReactNode;
};

type State = { error: Error | null };

/**
 * Per-tab crash isolation. Without this, an exception in any one tab (all five are mounted
 * at once) throws the whole React tree to a blank screen with no recovery — on mobile the
 * user must force-kill the app. This catches the error, shows a localized retry card, and
 * auto-resets when the user navigates to a different tab (tabKey change).
 */
export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.tabKey}] tab crashed`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.tabKey !== this.props.tabKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
          <p className="text-sm font-semibold text-foreground">Bu ekran beklenmedik bir hatayla karşılaştı</p>
          <p className="text-xs text-muted-foreground">
            Diğer sekmeler etkilenmedi. Tekrar deneyebilir ya da başka bir sekmeye geçebilirsiniz.
          </p>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            <RefreshCw className="w-4 h-4" /> Yeniden dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
