import React from "react";
import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  badge,
  span = "col-span-1",
}) => {
  return (
    <div
      className={cn(
        "row-span-1 rounded-3xl group/bento hover:shadow-[0_20px_50px_rgba(139,92,246,0.18)] transition-all duration-300 p-6 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--primary-border)] flex flex-col justify-between space-y-4 relative overflow-hidden",
        span,
        className
      )}
    >
      {/* Background glow streak */}
      <div className="pointer-events-none absolute -right-12 -top-12 w-40 h-40 rounded-full bg-[var(--primary)]/10 blur-2xl group-hover/bento:bg-[var(--primary)]/20 transition-all duration-500" />
      
      {header && <div className="relative z-10">{header}</div>}
      
      <div className="group-hover/bento:translate-x-1 transition-transform duration-300 relative z-10">
        <div className="flex items-center justify-between mb-3">
          {icon && (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[var(--primary-dim)] text-[var(--primary-light)] border border-[var(--primary-border)] shadow-sm">
              {icon}
            </div>
          )}
          {badge && (
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              {badge}
            </span>
          )}
        </div>
        
        <div className="font-bold text-lg text-[var(--text-primary)] mb-1">
          {title}
        </div>
        <div className="font-normal text-xs text-[var(--text-muted)] leading-relaxed">
          {description}
        </div>
      </div>
    </div>
  );
};
