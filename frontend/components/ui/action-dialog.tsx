"use client";

import { useEffect, useState } from "react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";
import { Label, Textarea } from "./forms";

export function ActionDialog({
  open,
  title,
  description,
  reasonLabel = "Catatan",
  reasonRequired = false,
  confirmLabel = "Konfirmasi",
  danger = false,
  busy = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  reasonLabel?: string;
  reasonRequired?: boolean;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        showClose={!busy}
        aria-busy={busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="-mx-6 -mt-6 mb-5 border-b border-border bg-surface-subtle px-6 py-5 pr-14">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        <div>
          <Label htmlFor="action-dialog-reason">
            {reasonLabel}
            {!reasonRequired && (
              <span className="font-normal text-muted"> (opsional)</span>
            )}
          </Label>
          <Textarea
            id="action-dialog-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            required={reasonRequired}
          />
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={busy || (reasonRequired && reason.trim().length < 3)}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "Memproses..." : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
