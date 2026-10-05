import { BrandMark } from "@/shared/ui/brand-mark";
import { Button } from "@/shared/ui/button";
import { usePresentation } from "./context";

export function EmptyState({
  disabled,
  onAsk,
}: {
  disabled: boolean;
  onAsk: (question: string) => void;
}) {
  const { t } = usePresentation();
  return (
    <li className="flex flex-col gap-5 pt-2 @md/transcript:pt-6">
      <div className="flex flex-col items-start gap-3">
        <BrandMark size={56} />
        <h2 className="font-display text-heading">{t.greetingTitle}</h2>
        <p className="max-w-measure text-body text-copy">{t.greetingBody}</p>
      </div>
      <section aria-label={t.startersLabel} className="flex flex-col gap-2">
        <h3 className="font-sans text-tiny font-extrabold tracking-wide text-muted uppercase">
          {t.startersLabel}
        </h3>
        <ul className="grid gap-2 @xl/transcript:grid-cols-2">
          {t.starters.map((question) => (
            <li key={question}>
              <Button
                variant="chip"
                size="sm"
                disabled={disabled}
                onClick={() => onAsk(question)}
                className="h-auto w-full justify-start py-2.5 whitespace-normal"
              >
                {question}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </li>
  );
}
