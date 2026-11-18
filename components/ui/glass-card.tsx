"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type GlassVariant = "default" | "strong" | "subtle";

export interface GlassCardProps
  extends Omit<HTMLMotionProps<"div">, "children"> {
  variant?: GlassVariant;
  /** animated neon hairline border */
  edge?: boolean;
  /** lift + glow on hover */
  interactive?: boolean;
  /** inner top sheen */
  sheen?: boolean;
  children?: React.ReactNode;
}

const variantClass: Record<GlassVariant, string> = {
  default: "glass",
  strong: "glass-strong",
  subtle: "glass-subtle",
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard(
    {
      className,
      variant = "default",
      edge = false,
      interactive = false,
      sheen = false,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <motion.div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-3xl",
          variantClass[variant],
          edge && "neon-edge",
          className,
        )}
        whileHover={
          interactive
            ? {
                y: -3,
                boxShadow:
                  "0 24px 60px -20px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.12), 0 0 48px -18px rgba(99,102,241,0.55)",
              }
            : undefined
        }
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        {...props}
      >
        {sheen && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />
        )}
        {children}
      </motion.div>
    );
  },
);
