"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({
  className,
  children,
  style,
  showClose = true,
  ...props
}: DialogPrimitive.DialogContentProps & { showClose?: boolean }) {
  const fullScreen =
    typeof className === "string" && className.includes("h-[100dvh]");
  const viewportStyle = fullScreen
    ? style
    : {
        ...style,
        maxHeight: "calc(100dvh - env(safe-area-inset-top) - 0.75rem)",
      };
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-binder-deep/64 data-[state=open]:animate-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] w-full overscroll-contain overflow-x-hidden overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lift sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-5",
          className,
        )}
        style={viewportStyle}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            aria-label="Tutup"
            className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-subtle hover:text-brand sm:right-3 sm:top-3"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogTitle(props: DialogPrimitive.DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      className="pr-10 text-section-title text-brand"
      {...props}
    />
  );
}
export function DialogDescription(
  props: DialogPrimitive.DialogDescriptionProps,
) {
  return (
    <DialogPrimitive.Description
      className="mt-1 text-body text-muted"
      {...props}
    />
  );
}
