import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Configuración de la IA. Todo vive sólo en el servidor: las claves nunca
 * viajan al navegador (una clave incluida en el JavaScript que se descarga
 * queda al alcance de cualquiera que abra las herramientas de desarrollo).
 *
 * Hay dos caminos, y se elige por variables de entorno sin tocar código:
 *   · OpenRouter: pasarela con una sola cuenta para muchos modelos.
 *   · Anthropic directo, con el SDK oficial.
 */

export type Proveedor = "anthropic" | "openrouter";

/** Modelo en Anthropic directo. */
export const MODELO_ANTHROPIC = process.env.IA_MODELO?.trim() || "claude-opus-5-5";

/** Modelo en OpenRouter (slug de openrouter.ai/models). */
export const MODELO_OPENROUTER = process.env.OPENROUTER_MODELO?.trim() || "anthropic/claude-opus-5.5";

const ESFUERZOS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Esfuerzo = (typeof ESFUERZOS)[number];

/** Opus 5.5 trae "medium" por defecto; para documentos oficiales usamos "high". */
export const ESFUERZO: Esfuerzo = ESFUERZOS.includes(process.env.IA_ESFUERZO as Esfuerzo)
  ? (process.env.IA_ESFUERZO as Esfuerzo)
  : "high";

/**
 * Qué proveedor se usa. IA_PROVEEDOR acepta "anthropic", "openrouter" o
 * "auto" (por defecto): en auto manda el que tenga clave y, si están las
 * dos, Anthropic directo.
 */
export function proveedor(): Proveedor | null {
  const elegido = (process.env.IA_PROVEEDOR ?? "auto").trim().toLowerCase();
  const hayAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hayOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  if (elegido === "anthropic") return hayAnthropic ? "anthropic" : null;
  if (elegido === "openrouter") return hayOpenRouter ? "openrouter" : null;
  if (hayAnthropic) return "anthropic";
  return hayOpenRouter ? "openrouter" : null;
}

let cliente: Anthropic | null = null;

export function getCliente(): Anthropic {
  if (!cliente) {
    // Lee ANTHROPIC_API_KEY del entorno. Dos reintentos automáticos ante 429/5xx.
    cliente = new Anthropic({ maxRetries: 2, timeout: 5 * 60 * 1000 });
  }
  return cliente;
}
