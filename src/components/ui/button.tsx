"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] text-[13px] font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.985]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_1px_2px_rgba(0,0,0,0.18)] hover:brightness-110",
        secondary:
          "border border-[var(--border)] bg-[var(--surface)] text-ink hover:bg-[var(--surface-hover)]",
        ghost: "text-muted hover:bg-[var(--surface-hover)] hover:text-ink",
        subtle: "bg-[var(--surface-2)] text-ink hover:bg-[var(--surface-hover)]",
        danger: "bg-[var(--danger)] text-white hover:brightness-110",
        link: "text-[var(--accent)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 px-2.5 text-[12px]",
        md: "h-9 px-3.5",
        lg: "h-10 px-5 text-sm",
        icon: "size-8",
        "icon-sm": "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
);
Button.displayName = "Button";

export { buttonVariants };
