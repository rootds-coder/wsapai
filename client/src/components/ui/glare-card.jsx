import React, { useRef } from "react";
import { cn } from "@/lib/utils";

export const GlareCard = ({
  children,
  className,
}) => {
  const isPointerInside = useRef(false);
  const refElement = useRef(null);
  const state = useRef({
    glare: { x: 50, y: 50, opacity: 0 },
    background: { x: 50, y: 50 },
    rotate: { x: 0, y: 0 },
  });

  const updateStyles = () => {
    if (refElement.current) {
      refElement.current.style.setProperty("--m-x", `${state.current.glare.x}%`);
      refElement.current.style.setProperty("--m-y", `${state.current.glare.y}%`);
      refElement.current.style.setProperty("--r-x", `${state.current.rotate.x}deg`);
      refElement.current.style.setProperty("--r-y", `${state.current.rotate.y}deg`);
      refElement.current.style.setProperty("--opacity", `${state.current.glare.opacity}`);
    }
  };

  return (
    <div
      ref={refElement}
      className={cn(
        "relative isolation-auto flex flex-col justify-between rounded-3xl border border-[var(--border-default)] p-6 bg-[var(--bg-elevated)] transition-transform duration-300 ease-out hover:border-[var(--primary-border)] hover:shadow-[0_20px_50px_rgba(139,92,246,0.2)]",
        className
      )}
      style={{
        transform: "rotateY(var(--r-x, 0deg)) rotateX(var(--r-y, 0deg))",
        perspective: "1000px",
      }}
      onPointerMove={(event) => {
        const rotateFactor = 0.4;
        const rect = event.currentTarget.getBoundingClientRect();
        const position = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        const percentage = {
          x: (position.x / rect.width) * 100,
          y: (position.y / rect.height) * 100,
        };
        const delta = {
          x: percentage.x - 50,
          y: percentage.y - 50,
        };

        state.current.glare.x = percentage.x;
        state.current.glare.y = percentage.y;
        state.current.glare.opacity = 0.4;
        state.current.rotate.x = -(delta.x * rotateFactor);
        state.current.rotate.y = delta.y * rotateFactor;
        updateStyles();
      }}
      onPointerEnter={() => {
        isPointerInside.current = true;
        if (refElement.current) {
          setTimeout(() => {
            if (isPointerInside.current) {
              refElement.current?.style.setProperty("--duration", "0s");
            }
          }, 300);
        }
      }}
      onPointerLeave={() => {
        isPointerInside.current = false;
        state.current.glare.opacity = 0;
        state.current.rotate.x = 0;
        state.current.rotate.y = 0;
        updateStyles();
      }}
    >
      <div className="relative z-10">{children}</div>
      {/* Glare effect overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl transition-opacity duration-300"
        style={{
          opacity: "var(--opacity, 0)",
          background: `radial-gradient(circle at var(--m-x, 50%) var(--m-y, 50%), rgba(255,255,255,0.15) 0%, rgba(139,92,246,0.1) 40%, transparent 80%)`,
        }}
      />
    </div>
  );
};
