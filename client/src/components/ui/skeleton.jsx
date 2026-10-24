import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-xl bg-[var(--bg-surface)]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
