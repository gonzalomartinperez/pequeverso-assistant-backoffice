"use client";
import { useState } from "react";
import { Button } from "@/shared/ui/button";

/** Two-step destructive submit inside a server-action form (no modal, keyboard friendly). */
export function ConfirmSubmit({ label, confirmLabel }: { label: string; confirmLabel: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed)
    return (
      <Button variant="outline" size="sm" onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  return (
    <span className="flex flex-wrap gap-2">
      <Button type="submit" size="sm" autoFocus>
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancelar
      </Button>
    </span>
  );
}
