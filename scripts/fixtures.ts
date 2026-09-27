// Deterministic answers for the mock API. MOCKED DATA: shapes follow the pinned contract
// (contracts/source.json); texts and product facts are copied from the API's catalog snapshot
// (catalog/catalog.v1.json) so the UI is reviewed with realistic content. The comparison
// scenario is synthetic: the live catalog has one purchasable product, so two-product answers
// only exercise layout. Prices are marked verified at a fixed time.

/** Wire shapes of the pinned contract (contracts/api/openapi.json), as the mock emits them. */
export type WireImage = { url: string; width: number; height: number; alt: string };
export type WireProduct = {
  id: string;
  name: string;
  summary: string;
  age_range: string;
  url: string;
  purchase_url: string;
  image: WireImage | null;
  price: {
    amount: string;
    currency: "USD";
    display: string;
    note: string;
    tax_note: string;
    verified_at: string;
  } | null;
};
export type WireResource = {
  id: string;
  product_id: string;
  title: string;
  pages: number | null;
  description: string;
  image: WireImage | null;
};
export type WireLink = { id: string; label: string; url: string };
export type WireSource = { id: string; title: string; url: string };
export type WireDetails = {
  content: string;
  products: WireProduct[];
  resources: WireResource[];
  links: WireLink[];
  sources: WireSource[];
  follow_ups: string[];
  notices: string[];
};
export type Plan = {
  refuse?: { status: number; code: string; retryable: boolean };
  chunks?: string[];
  fail?: { code: string; retryable: boolean };
  eof?: boolean;
  question?: string;
  answer?: WireDetails;
  slow?: number;
};

const VERIFIED_AT = "2026-09-27T12:00:00Z";

export function catalog(storefront: string) {
  const media = (file: string) => `${storefront}/media/${file}`;
  const grafismo: WireProduct = {
    id: "grafismo-fonetico",
    name: "Grafismo Fonético",
    summary:
      "Kit imprimible de 9 PDF y 414 páginas para practicar letras, sonidos, sílabas, palabras y trazos en casa, 10 minutos por día. Para niños de 3 a 7 años. Acceso digital inmediato.",
    age_range: "3 a 7 años",
    url: `${storefront}/grafismo-fonetico/`,
    purchase_url: `${storefront}/grafismo-fonetico/#comprar`,
    image: {
      url: media("gf-hero-w480-634ecbbf.webp"),
      width: 480,
      height: 360,
      alt: "Kit completo Grafismo Fonético impreso junto a sus ocho recursos complementarios",
    },
    price: {
      amount: "14.99",
      currency: "USD",
      display: "US$14,99",
      note: "Precio de referencia en dólares (USD). Hotmart lo convierte a tu moneda local y muestra el total final, con impuestos, antes de pagar.",
      tax_note: "+ impuestos aplicables según el país",
      verified_at: VERIFIED_AT,
    },
  };
  const pack: WireProduct = {
    id: "imprime-y-juega",
    name: "Pack Imprime y Juega",
    summary: "SYNTHETIC FIXTURE for layout only: 6 PDF y 384 páginas de juegos imprimibles.",
    age_range: "3 a 7 años",
    url: `${storefront}/imprime-y-juega/`,
    purchase_url: `${storefront}/imprime-y-juega/#comprar`,
    image: {
      url: media("pack-hero-w480-aaf7528f.webp"),
      width: 480,
      height: 360,
      alt: "Pack Imprime y Juega",
    },
    price: null,
  };
  const resource = (
    id: string,
    title: string,
    pages: number,
    description: string,
    file: string,
  ): WireResource => ({
    id: `grafismo-fonetico/${id}`,
    product_id: "grafismo-fonetico",
    title,
    pages,
    description,
    image: file ? { url: media(file), width: 360, height: 270, alt: "" } : null,
  });
  const resources = [
    resource(
      "paso-a-paso",
      "Grafismo Fonético Paso a Paso",
      120,
      "Material principal: sílabas grandes, imágenes reconocibles y palabras para trazar.",
      "gf-card-01-w360-ce9a10d0.webp",
    ),
    resource(
      "10-minutos",
      "10 Minutos de Grafismo Fonético",
      16,
      "Bono incluido. Una guía breve para elegir la hoja del día.",
      "gf-card-02-w360-d1882e32.webp",
    ),
    resource(
      "silabas-en-tus-manos",
      "Sílabas en Tus Manos",
      40,
      "Bono incluido. Tarjetas recortables para formar palabras.",
      "gf-card-03-w360-70c070a4.webp",
    ),
  ];
  const sources: WireSource[] = [
    {
      id: "faq.grafismo-fonetico.05",
      title: "¿Qué incluye exactamente la compra?",
      url: `${storefront}/grafismo-fonetico/#preguntas`,
    },
    { id: "policy.delivery", title: "Entrega digital", url: `${storefront}/compras-y-reembolsos/` },
  ];
  const links: WireLink[] = [
    { id: "support", label: "Soporte y contacto", url: `${storefront}/soporte/` },
    {
      id: "hotmart-purchases",
      label: "Mis compras en Hotmart",
      url: "https://consumer.hotmart.com/",
    },
  ];
  return { grafismo, pack, resources, sources, links };
}

const INCLUDES = `**Grafismo Fonético** es un kit imprimible de **9 PDF y 414 páginas** para practicar letras, sonidos y sílabas en casa, unos 10 minutos por día.

Incluye:
- **Paso a Paso** (120 páginas), el material principal.
- **8 bonos incluidos**, como 10 Minutos y Sílabas en Tus Manos.
- Acceso digital inmediato: recibes el acceso por correo tras la aprobación del pago.

Es para niños de **3 a 7 años**. Puedes imprimir solo las hojas que vayas a usar.`;

/**
 * Picks a scenario from the question. Keywords are test hooks only (the real API has no such
 * behavior): lent(o|a), interrumpir, falla, ocupado, expirar, presupuesto, larg(o|a), enlaces, comparar,
 * precio, tarjeta.
 */
export function scenario(content: string, storefront: string): Plan {
  const c = catalog(storefront);
  const text = content.toLowerCase();
  const base: Omit<WireDetails, "content"> = {
    products: [],
    resources: [],
    links: [],
    sources: [],
    follow_ups: [],
    notices: [],
  };
  if (text.includes("ocupado")) return { refuse: { status: 503, code: "busy", retryable: true } };
  if (text.includes("expirar"))
    return { refuse: { status: 401, code: "session_expired", retryable: false } };
  if (text.includes("falla"))
    return { chunks: ["Estoy revisando "], fail: { code: "generation_failed", retryable: true } };
  if (text.includes("presupuesto"))
    return { chunks: [], fail: { code: "budget_exhausted", retryable: false } };
  if (text.includes("interrumpir"))
    return { chunks: ["La respuesta empieza a llegar y "], eof: true };
  if (text.includes("tarjeta"))
    return {
      question: "[mensaje eliminado: contenía datos de pago]",
      answer: {
        ...base,
        content:
          "No puedo recibir datos de pago. El pago se hace solo en la página segura de Hotmart desde la tienda.",
        links: c.links.slice(0, 1),
        notices: ["payment_data_refused"],
      },
    };
  if (text.includes("comparar"))
    return {
      answer: {
        ...base,
        content: "Te muestro los dos lado a lado. **Datos sintéticos de prueba.**",
        products: [c.grafismo, c.pack],
        resources: c.resources.slice(0, 2),
        follow_ups: ["¿Cuál conviene para empezar?"],
      },
    };
  if (text.includes("precio"))
    return {
      answer: {
        ...base,
        content:
          "El precio actualizado está en la página del kit; ahí verás el total en tu moneda antes de pagar.",
        products: [{ ...c.grafismo, price: null }],
        sources: c.sources.slice(0, 1),
      },
    };
  if (text.includes("enlaces"))
    return {
      answer: {
        ...base,
        content:
          "Estos enlaces vienen del catálogo: [soporte](" +
          storefront +
          "/soporte/). Este no debe ser un enlace: [sitio externo](https://example.com/phish) y tampoco javascript:alert(1).",
        products: [
          { ...c.grafismo, id: "foreign", url: "https://example.com/grafismo/" },
          c.grafismo,
        ],
        links: [
          ...c.links,
          { id: "bad", label: "Enlace no permitido", url: "https://evil.example/" },
        ],
        sources: c.sources,
      },
    };
  if (text.includes("larg")) {
    const paragraph =
      "Una respuesta extensa para revisar la lectura: palabras largas como supercalifragilisticoespialidoso, una URL sin espacios " +
      `${storefront}/grafismo-fonetico/?utm_source=assistant&utm_medium=chat&utm_campaign=muy-largo-sin-espacios-para-romper-el-diseno ` +
      "y marcas <script>alert(1)</script> que deben verse como texto.";
    return {
      chunks: Array.from(
        { length: 12 },
        (_, i) => `${i ? "\n\n" : ""}**Parte ${i + 1}.** ${paragraph}`,
      ),
      answer: { ...base, content: "", follow_ups: ["¿Puedes resumirlo?"] },
      slow: 60,
    };
  }
  return {
    answer: {
      ...base,
      content: INCLUDES,
      products: [c.grafismo],
      resources: c.resources,
      links: c.links.slice(0, 1),
      sources: c.sources,
      follow_ups: [
        "¿Por cuál recurso empiezo?",
        "¿Necesito imprimir todo?",
        "¿Cómo funciona la garantía?",
      ],
    },
    slow: text.includes("lent") ? 400 : 0,
  };
}
