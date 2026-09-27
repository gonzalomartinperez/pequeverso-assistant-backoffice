/**
 * Interface copy. Spanish is the only supported locale: the storefront ships neutral Latin
 * American Spanish with "tú" and the API answers only in Spanish (`SiteIn.language = 'es'`).
 * Adding a locale means adding a dictionary that satisfies `Copy`; the compiler lists every gap.
 */
import type {
  ErrorCode,
  Notice,
  UnavailableReason,
} from "../../features/assistant/domain/models.ts";

export type Locale = "es";

const es = {
  assistantName: "Asistente Pequeverso",
  assistantTagline: "Te ayudo a elegir con calma",
  brandWordmark: "pequeverso",
  standaloneTitle: "Asistente de compras",
  backToStore: "Volver a la tienda",
  standaloneNote:
    "Respuestas informativas basadas en el catálogo de Pequeverso. La compra siempre se hace en la tienda.",

  greetingTitle: "¡Hola! ¿En qué te ayudo?",
  greetingBody:
    "Pregúntame por los materiales, las edades o cómo se usan en casa. Te respondo con la información de la tienda.",
  startersLabel: "Preguntas para empezar",
  starters: [
    "¿Qué incluye Grafismo Fonético?",
    "¿Sirve para un niño de 4 años?",
    "¿Cómo se usa en casa, día a día?",
    "¿Cómo recibo el material después de comprar?",
  ],

  transcriptLabel: "Conversación con el asistente",
  you: "Tú",
  assistant: "Asistente",
  composerLabel: "Escribe tu pregunta",
  composerPlaceholder: "Escribe tu pregunta…",
  composerHint: "Enter para enviar · Shift + Enter para nueva línea",
  send: "Enviar pregunta",
  stop: "Detener respuesta",
  stopping: "Deteniendo…",
  charactersLeft: (count: number) =>
    count === 1 ? "Queda 1 carácter" : `Quedan ${count} caracteres`,
  tooLong: (max: number) => `Tu pregunta supera el máximo de ${max} caracteres.`,
  footnote: "Respuestas informativas. Revisa la página del kit antes de comprar.",

  thinking: "Buscando en el catálogo…",
  writing: "Escribiendo respuesta",
  answerReady: "Respuesta lista.",
  answerStopped: "Respuesta detenida.",
  answerInterrupted: "La respuesta se interrumpió.",
  answerFailed: "No se pudo completar la respuesta.",
  newMessages: "Ir a la última respuesta",

  partialLabel: "Respuesta incompleta",
  cancelledTitle: "Detuviste la respuesta.",
  interruptedTitle: "Se cortó la conexión antes de terminar la respuesta.",
  failedTitle: "No pude completar la respuesta.",
  retry: "Reintentar",
  dismiss: "Cerrar aviso",

  productsLabel: "Productos mencionados",
  compareLabel: "Comparación",
  viewProduct: "Ver el kit",
  howToBuy: "Cómo comprar",
  opensInNewTab: "(se abre en una pestaña nueva)",
  ageRange: "Edad",
  price: "Precio",
  priceVerified: (date: string) => `Precio confirmado el ${date}`,
  priceUnverified: "Precio en la página del kit",
  resourcesLabel: "Incluye",
  pages: (count: number) => (count === 1 ? "1 página" : `${count} páginas`),
  resourceCount: (count: number) => (count === 1 ? "1 recurso" : `${count} recursos`),
  sourcesLabel: (count: number) => (count === 1 ? "1 fuente" : `${count} fuentes`),
  sourcesHint: "Información de la tienda usada en esta respuesta",
  linksLabel: "Enlaces útiles",
  followUpsLabel: "Puedes preguntar",

  notices: {
    answer_replaced:
      "No pude confirmar esa respuesta con los datos del catálogo, así que te muestro una respuesta segura.",
    payment_data_refused:
      "Por tu seguridad, no escribas datos de tarjetas aquí. El pago se hace solo en la página segura de la tienda.",
    contact_data_redacted: "Ocultamos datos de contacto de tu mensaje para proteger tu privacidad.",
  } satisfies Record<Notice, string>,

  clear: "Nueva conversación",
  clearConfirmTitle: "¿Empezar de nuevo?",
  clearConfirmBody: "Se borrará esta conversación.",
  clearConfirm: "Borrar",
  clearCancel: "Cancelar",
  clearing: "Borrando…",
  expand: "Ampliar panel",
  restore: "Reducir panel",
  minimize: "Minimizar asistente",

  connecting: "Conectando con el asistente…",
  reconnect: "Reintentar conexión",
  expiredNotice: "Tu conversación anterior expiró. Puedes seguir con una nueva.",
  offlineTitle: "No pudimos conectar con el asistente.",
  offlineBody:
    "Revisa tu conexión e inténtalo de nuevo. La tienda sigue funcionando con normalidad.",
  unavailableTitle: "El asistente no está disponible en este momento.",
  unavailableBody: {
    assistant_disabled: "Puedes seguir navegando la tienda o escribirnos desde Soporte.",
    budget_exhausted:
      "Alcanzó su límite de uso por ahora. Puedes seguir navegando la tienda o escribirnos desde Soporte.",
    catalog_unavailable:
      "No puedo consultar el catálogo ahora. Puedes seguir navegando la tienda o escribirnos desde Soporte.",
  } satisfies Record<UnavailableReason, string>,
  supportLink: "Ir a Soporte",

  errors: {
    invalid_request: "No pude procesar esa pregunta. Prueba a escribirla de otra forma.",
    origin_denied: "El asistente no acepta preguntas desde esta página.",
    csrf_failed: "La sesión se renovó. Vuelve a enviar tu pregunta.",
    session_expired: "La sesión expiró. Vuelve a enviar tu pregunta.",
    rate_limited: "Hiciste muchas preguntas seguidas. Espera un momento antes de seguir.",
    busy: "El asistente está ocupado. Inténtalo de nuevo en unos segundos.",
    run_in_progress: "Todavía estoy respondiendo tu pregunta anterior.",
    idempotency_conflict: "No pude reenviar esa pregunta. Escríbela otra vez.",
    run_not_found: "Esa respuesta ya terminó.",
    budget_exhausted: "El asistente alcanzó su límite de uso por ahora.",
    assistant_disabled: "El asistente no está disponible en este momento.",
    catalog_unavailable: "No puedo consultar el catálogo ahora.",
    provider_unavailable: "El servicio de respuestas no está disponible. Inténtalo más tarde.",
    generation_failed: "No pude generar la respuesta. Puedes reintentar.",
    timeout: "La respuesta tardó demasiado. Puedes reintentar.",
    dependency_unavailable: "El asistente tuvo un problema temporal. Inténtalo más tarde.",
    not_found: "No encontré lo que buscabas.",
    network: "Se perdió la conexión. Revisa tu red e inténtalo de nuevo.",
    protocol: "Recibí una respuesta inesperada del servidor. Inténtalo de nuevo.",
  } satisfies Record<ErrorCode, string>,
};

export type Copy = typeof es;

export const copy: Record<Locale, Copy> = { es };

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(iso));
}
