import { CloudOff, LifeBuoy, Loader2, RotateCcw } from "lucide-react";
import { BrandMark } from "@/shared/ui/brand-mark";
import { Button, LinkButton } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import type { Availability } from "../domain/models";
import { usePresentation } from "./context";

export function Connecting() {
  const { t } = usePresentation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <BrandMark size={40} />
      <p role="status" className="flex items-center gap-2 text-small text-muted">
        <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
        {t.connecting}
      </p>
    </div>
  );
}

function SupportLink() {
  const { t, supportUrl } = usePresentation();
  if (!supportUrl) return null;
  return (
    <LinkButton
      href={supportUrl}
      target="_blank"
      rel="noopener noreferrer"
      variant="outline"
      size="sm"
    >
      <LifeBuoy aria-hidden="true" className="size-4" />
      {t.supportLink}
      <span className="sr-only">{t.opensInNewTab}</span>
    </LinkButton>
  );
}

/** Session could not be opened (network or dependency failure): the store keeps working. */
export function Offline({ onReconnect, busy }: { onReconnect: () => void; busy: boolean }) {
  const { t } = usePresentation();
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 p-5">
      <Callout tone="info" role="alert">
        <CloudOff aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-bold text-ink">{t.offlineTitle}</p>
          <p>{t.offlineBody}</p>
        </div>
      </Callout>
      <div className="flex flex-wrap gap-2">
        <Button variant="action" size="sm" onClick={onReconnect} disabled={busy}>
          <RotateCcw aria-hidden="true" className="size-4" />
          {t.reconnect}
        </Button>
        <SupportLink />
      </div>
    </div>
  );
}

/** The API refuses new questions (disabled, budget or catalog). History stays readable. */
export function Unavailable({
  availability,
}: {
  availability: Extract<Availability, { status: "unavailable" }>;
}) {
  const { t } = usePresentation();
  return (
    <div className="flex flex-col gap-3">
      <Callout tone="info" role="status">
        <LifeBuoy aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-bold text-ink">{t.unavailableTitle}</p>
          <p>{t.unavailableBody[availability.reason]}</p>
        </div>
      </Callout>
      <div>
        <SupportLink />
      </div>
    </div>
  );
}
