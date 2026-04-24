import React from 'react';

type SectionCrashBoundaryProps = {
  sectionName: string;
  children: React.ReactNode;
};

type SectionCrashBoundaryState = {
  error: Error | null;
};

export class SectionCrashBoundary extends React.Component<
  SectionCrashBoundaryProps,
  SectionCrashBoundaryState
> {
  state: SectionCrashBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SectionCrashBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[crash-isolation] ${this.props.sectionName} crashed: ${error.message}`);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {this.props.sectionName} crashed
        </div>
      );
    }

    return this.props.children;
  }
}
