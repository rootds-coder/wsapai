import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-xl border border-[var(--border-default)] bg-[var(--input-bg)]",
        "px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
        "transition-all duration-150 outline-none",
        "hover:border-[var(--border-hover)]",
        "focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-xs file:font-medium",
        className
      )}
      {...props}
    />
  );
}

export { Input };
