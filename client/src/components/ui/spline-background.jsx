import React from 'react'
import { SplineScene } from '@/components/ui/splite'

export function SplineBackground({ className = '' }) {
  return (
    <div className={`fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-50 md:opacity-65 transition-opacity duration-500 ${className}`}>
      <SplineScene
        scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
        className="w-full h-full scale-105 md:scale-100"
      />
    </div>
  )
}
