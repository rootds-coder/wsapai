import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex h-9 items-center gap-0.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] p-1",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
        "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50",
        "data-[state=active]:text-[var(--text-primary)]",
        "data-[state=active]:bg-[var(--bg-hover)]",
        "data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-3 focus-visible:outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
