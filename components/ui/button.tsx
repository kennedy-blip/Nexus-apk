"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: React.ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-br from-indigo-500 via-violet-500 to-indigo-600 shadow-[0_8px_28px_-10px_rgba(99,102,241,0.85)] hover:shadow-[0_12px_36px_-10px_rgba(99,102,241,1)] border border-white/15",
  secondary:
    "text-zinc-100 bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 backdrop-blur-xl",
  ghost:
    "text-zinc-300 hover:text-white hover:bg-white/[0.07] border border-transparent",
  danger:
    "text-rose-100 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30",
  outline:
    "text-zinc-200 border border-white/15 hover:border-indigo-400/60 hover:text-white bg-transparent",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-xl gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-[15px] rounded-2xl gap-2.5",
  icon: "h-9 w-9 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", loading, children, disabled, ...props },
    ref,
  ) {
    return (
      <motion.button
        ref={ref}
        whileHover={disabled || loading ? undefined : { scale: 1.02 }}
        whileTap={disabled || loading ? undefined : { scale: 0.97 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        disabled={disabled || loading}
        className={cn(
          "relative inline-flex select-none items-center justify-center font-medium",
          "transition-colors duration-200 will-change-transform",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <span
            aria-hidden
            className="absolute inset-0 overflow-hidden rounded-[inherit]"
          >
            <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          </span>
        )}
        {children}
      </motion.button>
    );
  },
);
