import React, { Suspense, lazy, Component } from 'react'
import { Loader2 } from 'lucide-react'

const Spline = lazy(() => import('@splinetool/react-spline'))

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.warn("Spline 3D load error (bypassed):", error);
  }
  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export function SplineScene({ scene, className }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Spline
          scene={scene}
          className={className}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
