/**
 * URL policy. Every URL the UI renders or acts on (product pages, purchase sections, images,
 * links, sources and links inside answer text) is untrusted until it passes here, even though the
 * API allowlists them too. Answer text never produces links (see rich-text.ts). Pure: uses only
 * the WHATWG `URL` parser.
 */
import type { Message, Product, Resource } from "./models.ts";

export type LinkPolicy = {
  /** Exact storefront origin, e.g. "https://pequeverso.com" (no www variant is implied). */
  storefrontOrigin: string;
  /** Exact extra hosts allowed for informational links (https only), e.g. "consumer.hotmart.com". */
  linkHosts: readonly string[];
};

function parse(value: string): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** A URL on the exact storefront origin (the only destination for product and purchase actions). */
export function storefrontUrl(value: string, policy: LinkPolicy): string | null {
  const url = parse(value);
  return url && url.origin === policy.storefrontOrigin ? url.href : null;
}

/** A link the visitor may open in a new tab: the storefront, or https on an allowlisted host. */
export function externalUrl(value: string, policy: LinkPolicy): string | null {
  const url = parse(value);
  if (!url) return null;
  if (url.origin === policy.storefrontOrigin) return url.href;
  return url.protocol === "https:" && policy.linkHosts.includes(url.hostname) ? url.href : null;
}

function safeImage<T extends { image: Product["image"] }>(item: T, policy: LinkPolicy): T {
  if (!item.image) return item;
  const url = storefrontUrl(item.image.url, policy);
  return { ...item, image: url ? { ...item.image, url } : null };
}

/**
 * Drops references whose URLs fail the policy instead of rendering a broken or foreign action.
 * A product card needs both a valid product page and purchase section on the storefront.
 */
export function applyLinkPolicy(message: Message, policy: LinkPolicy): Message {
  const products: Product[] = [];
  for (const product of message.products) {
    const url = storefrontUrl(product.url, policy);
    const purchaseUrl = storefrontUrl(product.purchaseUrl, policy);
    if (url && purchaseUrl) products.push(safeImage({ ...product, url, purchaseUrl }, policy));
  }
  const resources: Resource[] = message.resources.map((resource) => safeImage(resource, policy));
  const links = message.links.flatMap((link) => {
    const url = externalUrl(link.url, policy);
    return url ? [{ ...link, url }] : [];
  });
  const sources = message.sources.flatMap((source) => {
    const url = externalUrl(source.url, policy);
    return url ? [{ ...source, url }] : [];
  });
  return { ...message, products, resources, links, sources };
}
