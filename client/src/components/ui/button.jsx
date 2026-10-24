import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white shadow-lg shadow-[var(--purple-glow)] border border-[var(--primary-border)]",
        secondary:
          "bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-default)]",
        ghost:
          "bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent",
        outline:
          "bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-hover)]",
        destructive:
          "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40",
        success:
          "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40",
        link:
          "text-[var(--primary)] underline-offset-4 hover:underline bg-transparent border-none",
      },
      size: {
        sm:      "h-8  px-3 text-xs rounded-lg",
        default: "h-9  px-4 text-xs font-semibold rounded-xl",
        lg:      "h-10 px-6 text-sm font-bold rounded-xl",
        icon:    "h-9  w-9 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const MotionButton = motion.button;

function Button({ className, variant, size, asChild = false, disabled, ...props }) {
  const Comp = asChild ? Slot : MotionButton;
  return (
    <Comp
      whileTap={disabled ? {} : { scale: 0.97 }}
      whileHover={disabled ? {} : { scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled}
      {...props}
    />
  );
}

export { Button, buttonVariants };
