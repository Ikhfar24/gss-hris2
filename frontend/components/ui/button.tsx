import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-semibold shadow-control transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-px motion-reduce:transform-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-brand bg-brand text-white hover:border-binder-deep hover:bg-binder-deep",
        secondary:
          "border-border bg-surface text-foreground hover:border-brand/25 hover:bg-surface-subtle hover:text-brand",
        ghost:
          "border-transparent bg-transparent text-muted shadow-none hover:bg-surface-subtle hover:text-brand",
        danger:
          "border-danger bg-danger text-white hover:border-danger-hover hover:bg-danger-hover",
      },
      size: {
        sm: "h-11 px-3 text-xs sm:h-8",
        md: "h-11 px-4 sm:h-10",
        lg: "h-12 px-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
