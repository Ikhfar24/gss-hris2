"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function DropdownMenu({
  modal = false,
  ...props
}: DropdownMenuPrimitive.DropdownMenuProps) {
  return <DropdownMenuPrimitive.Root modal={modal} {...props} />;
}
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuLabel = DropdownMenuPrimitive.Label;
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: DropdownMenuPrimitive.DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-[70] min-w-52 rounded-lg border border-border bg-paper p-1.5 text-body text-foreground shadow-lift",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: DropdownMenuPrimitive.DropdownMenuItemProps & { danger?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex min-h-10 cursor-default select-none items-center gap-2 rounded-md px-3 py-2 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-subtle data-[highlighted]:text-brand",
        danger &&
          "text-danger data-[highlighted]:bg-danger-surface data-[highlighted]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export const ActionMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }
>(({ label = "Buka menu tindakan", className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    className={cn(
      "grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-paper text-muted transition-colors hover:border-brand/25 hover:bg-surface-subtle hover:text-brand sm:size-10",
      className,
    )}
    {...props}
  >
    <MoreHorizontal className="size-4" />
  </button>
));
ActionMenuTrigger.displayName = "ActionMenuTrigger";
