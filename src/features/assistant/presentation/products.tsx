import { ArrowUpRight, BookOpen, ExternalLink } from "lucide-react";
import { formatDate } from "@/shared/i18n/copy";
import { Badge } from "@/shared/ui/badge";
import { LinkButton } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { cn } from "@/shared/ui/cn";
import type { Price, Product, Resource } from "../domain/models";
import { usePresentation } from "./context";

/**
 * Prices appear only when the API sends `price` (it omits it when the storefront price is not
 * confirmed as current), always with the local-currency note and the confirmation date. There is
 * no stock, rating, discount or urgency field in the contract, so none is shown.
 */
function PriceBlock({ price }: { price: Price | null }) {
  const { t, locale } = usePresentation();
  if (!price) return <p className="text-small text-muted">{t.priceUnverified}</p>;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-price font-bold text-amount">{price.display}</span>
        <span className="text-tiny text-muted">{price.taxNote}</span>
      </p>
      <p className="text-tiny text-muted">{price.note}</p>
      <p className="text-tiny text-muted">
        {t.priceVerified(formatDate(price.verifiedAt, locale))}
      </p>
    </div>
  );
}

function ProductImage({ product, className }: { product: Product; className?: string }) {
  if (!product.image)
    return (
      <div
        aria-hidden="true"
        className={cn("grid place-items-center bg-surface-sunken text-icon", className)}
      >
        <BookOpen className="size-7" />
      </div>
    );
  return (
    // biome-ignore lint/performance/noImgElement: storefront-hosted image (validated origin), no optimizer route in this app
    <img
      src={product.image.url}
      alt={product.image.alt}
      width={product.image.width}
      height={product.image.height}
      loading="lazy"
      decoding="async"
      className={cn("bg-surface-sunken object-cover", className)}
    />
  );
}

export function ProductCard({ product, resources }: { product: Product; resources: Resource[] }) {
  const { t } = usePresentation();
  const headingId = `product-${product.id}`;
  return (
    <Card aria-labelledby={headingId} className="@container/card">
      <div className="flex flex-col @md/card:flex-row">
        <ProductImage
          product={product}
          className="aspect-[4/3] w-full @md/card:aspect-auto @md/card:w-44 @md/card:shrink-0"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <h3 id={headingId} className="font-display text-title font-bold text-ink">
              {product.name}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <Badge>{product.ageRange}</Badge>
              {resources.length > 0 && (
                <Badge tone="quiet">{t.resourceCount(resources.length)}</Badge>
              )}
            </div>
          </div>
          <p className="line-clamp-3 text-small text-copy">{product.summary}</p>
          <PriceBlock price={product.price} />
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              size="sm"
            >
              {t.viewProduct}
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">{t.opensInNewTab}</span>
            </LinkButton>
            <LinkButton
              href={product.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="purchase"
              size="sm"
            >
              {t.howToBuy}
              <ArrowUpRight aria-hidden="true" className="size-4" />
              <span className="sr-only">{t.opensInNewTab}</span>
            </LinkButton>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ResourceList({ resources }: { resources: Resource[] }) {
  const { t } = usePresentation();
  if (!resources.length) return null;
  return (
    <section aria-label={t.resourcesLabel} className="flex flex-col gap-2">
      <h3 className="font-sans text-tiny font-extrabold tracking-wide text-muted uppercase">
        {t.resourcesLabel}
      </h3>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-surface-raised">
        {resources.map((resource) => (
          <li key={resource.id} className="flex items-start gap-3 p-3">
            {resource.image ? (
              // biome-ignore lint/performance/noImgElement: storefront-hosted thumbnail (validated origin)
              <img
                src={resource.image.url}
                alt=""
                width={56}
                height={42}
                loading="lazy"
                decoding="async"
                className="h-[42px] w-14 shrink-0 rounded-chip bg-surface-sunken object-cover"
              />
            ) : (
              <BookOpen aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-icon" />
            )}
            <div className="min-w-0">
              <p className="font-bold text-ink">{resource.title}</p>
              <p className="text-small text-muted">
                {resource.pages ? `${t.pages(resource.pages)} · ` : ""}
                {resource.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Comparison({ products, resources }: { products: Product[]; resources: Resource[] }) {
  const { t } = usePresentation();
  const rows: { label: string; cell: (product: Product) => string }[] = [
    { label: t.ageRange, cell: (product) => product.ageRange },
    { label: t.price, cell: (product) => product.price?.display ?? t.priceUnverified },
    {
      label: t.resourcesLabel,
      cell: (product) => {
        const count = resources.filter((resource) => resource.productId === product.id).length;
        return count ? t.resourceCount(count) : "—";
      },
    },
  ];
  return (
    <section
      aria-label={t.compareLabel}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a horizontally scrollable region must be keyboard-scrollable (WCAG 2.1.1, axe scrollable-region-focusable)
      tabIndex={0}
      className="overflow-x-auto rounded-md border border-line"
    >
      <table className="w-full min-w-[20rem] border-collapse bg-surface-raised text-small">
        <caption className="sr-only">{t.compareLabel}</caption>
        <thead className="bg-surface-sunken">
          <tr>
            <td />
            {products.map((product) => (
              <th
                key={product.id}
                scope="col"
                className="px-3 py-2 text-left font-extrabold text-ink"
              >
                {product.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-line">
              <th scope="row" className="px-3 py-2 text-left font-bold text-muted">
                {row.label}
              </th>
              {products.map((product) => (
                <td key={product.id} className="px-3 py-2 text-copy">
                  {row.cell(product)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ProductSection({
  products,
  resources,
}: {
  products: Product[];
  resources: Resource[];
}) {
  const { t } = usePresentation();
  if (!products.length) return <ResourceList resources={resources} />;
  const loose = resources.filter(
    (resource) => !products.some((product) => product.id === resource.productId),
  );
  return (
    <section aria-label={t.productsLabel} className="flex flex-col gap-3">
      {products.length > 1 && <Comparison products={products} resources={resources} />}
      <ul className={cn("grid gap-3", products.length > 1 && "@2xl/transcript:grid-cols-2")}>
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard
              product={product}
              resources={resources.filter((resource) => resource.productId === product.id)}
            />
          </li>
        ))}
      </ul>
      <ResourceList resources={products.length === 1 ? resources : loose} />
    </section>
  );
}
