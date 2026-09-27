import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLinkPolicy,
  externalUrl,
  storefrontUrl,
} from "../../src/features/assistant/domain/links.ts";
import type { Message, Product } from "../../src/features/assistant/domain/models.ts";
import { parseInline, parseRichText } from "../../src/features/assistant/domain/rich-text.ts";

const policy = { storefrontOrigin: "https://pequeverso.com", linkHosts: ["consumer.hotmart.com"] };

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "grafismo-fonetico",
  name: "Grafismo Fonético",
  summary: "Kit",
  ageRange: "3 a 7 años",
  url: "https://pequeverso.com/grafismo-fonetico/",
  purchaseUrl: "https://pequeverso.com/grafismo-fonetico/#comprar",
  image: { url: "https://pequeverso.com/media/x.webp", width: 1, height: 1, alt: "" },
  price: null,
  ...overrides,
});

const answer = (overrides: Partial<Message>): Message => ({
  id: "a",
  role: "assistant",
  content: "",
  createdAt: "2026-09-27T12:00:00Z",
  products: [],
  resources: [],
  links: [],
  sources: [],
  followUps: [],
  notices: [],
  ...overrides,
});

describe("URL policy", () => {
  it("accepts only the exact storefront origin for product actions", () => {
    assert.equal(
      storefrontUrl("https://pequeverso.com/grafismo-fonetico/", policy),
      "https://pequeverso.com/grafismo-fonetico/",
    );
    for (const bad of [
      "https://www.pequeverso.com/grafismo-fonetico/", // no implied www variant
      "http://pequeverso.com/",
      "https://pequeverso.com.evil.example/",
      "https://user:pass@pequeverso.com/",
      "javascript:alert(1)",
      "//pequeverso.com/",
      "/grafismo-fonetico/",
    ])
      assert.equal(storefrontUrl(bad, policy), null, bad);
  });

  it("allows informational links only to the storefront or allowlisted https hosts", () => {
    assert.ok(externalUrl("https://consumer.hotmart.com/", policy));
    assert.equal(externalUrl("http://consumer.hotmart.com/", policy), null);
    assert.equal(externalUrl("https://pay.hotmart.com/x", policy), null);
    assert.equal(externalUrl("data:text/html,x", policy), null);
  });

  it("drops products whose page or purchase URL fails, and foreign images", () => {
    const safe = applyLinkPolicy(
      answer({
        products: [
          product(),
          product({ id: "foreign", url: "https://example.com/" }),
          product({ id: "bad-buy", purchaseUrl: "https://evil.example/pay" }),
          product({
            id: "img",
            image: { url: "https://evil.example/a.png", width: 1, height: 1, alt: "" },
          }),
        ],
        links: [
          { id: "ok", label: "Soporte", url: "https://pequeverso.com/soporte/" },
          { id: "bad", label: "Mal", url: "https://evil.example/" },
        ],
        sources: [{ id: "s", title: "S", url: "javascript:alert(1)" }],
      }),
      policy,
    );
    assert.deepEqual(
      safe.products.map((p) => p.id),
      ["grafismo-fonetico", "img"],
    );
    assert.equal(safe.products[1]?.image, null);
    assert.deepEqual(
      safe.links.map((l) => l.id),
      ["ok"],
    );
    assert.equal(safe.sources.length, 0);
  });
});

describe("rich text", () => {
  it("parses paragraphs, bold and bullet lists without any HTML path", () => {
    const blocks = parseRichText("**Hola** <b>x</b>\n\n- uno\n- **dos**\n\n1. a\n2. b");
    assert.equal(blocks.length, 3);
    assert.deepEqual(blocks[0], {
      kind: "paragraph",
      lines: [
        [
          { kind: "strong", children: [{ kind: "text", text: "Hola" }] },
          { kind: "text", text: " <b>x</b>" },
        ],
      ],
    });
    assert.equal(blocks[1]?.kind === "list" && blocks[1].items.length, 2);
    assert.equal(blocks[2]?.kind === "list" && blocks[2].ordered, true);
  });

  it("turns only http(s) URLs into link candidates and trims sentence punctuation", () => {
    const nodes = parseInline(
      "Mira https://pequeverso.com/soporte/. o [aquí](javascript:alert(1))",
    );
    assert.deepEqual(nodes[1], {
      kind: "link",
      label: "https://pequeverso.com/soporte/",
      url: "https://pequeverso.com/soporte/",
    });
    assert.ok(!nodes.some((node) => node.kind === "link" && node.url.startsWith("javascript")));
  });

  it("stays linear on adversarial input", () => {
    const input = "*".repeat(50_000) + "[".repeat(10_000);
    const started = performance.now();
    parseRichText(input);
    assert.ok(performance.now() - started < 500);
  });
});
