import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-150 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary-dim)] text-[var(--primary-light)] border-[var(--primary-border)]",
        secondary:
          "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-default)]",
        success:
          "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        destructive:
          "bg-red-500/10 text-red-400 border-red-500/20",
        warning:
          "bg-amber-500/10 text-amber-400 border-amber-500/20",
        outline:
          "bg-transparent text-[var(--text-secondary)] border-[var(--border-default)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
