import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ESFUERZO, proveedor } from "./cliente";
import { ErrorGeneracion, mensajeUsuario, type Consulta, type Salida } from "./comun";
import { ESQUEMA_NOTA } from "./esquema";
import { ESQUEMA_EXTRACCION, PROMPT_EXTRACCION } from "./extraccion";
import { PROMPT_SISTEMA } from "./prompt-sistema";
import { viaAnthropic } from "./via-anthropic";
import { ErrorOpenRouter, viaOpenRouter } from "./via-openrouter";
import {
  CamposExtraidosSchema,
  NotaGeneradaSchema,
  type CamposExtraidos,
  type EventoGeneracion,
  type PedidoGeneracion,
} from "@/lib/nota/tipos";

/** Manda la consulta al proveedor configurado y va devolviendo sus eventos. */
function consultar(c: Consulta, signal?: AbortSignal): AsyncGenerator<EventoGeneracion, Salida> {
  const cual = proveedor();
  if (!cual) throw new ErrorGeneracion("El generador no está configurado: falta la clave de la IA en el servidor.");
  return cual === "openrouter" ? viaOpenRouter(c, signal) : viaAnthropic(c, signal);
}

function leerJson(salida: Salida): unknown {
  try {
    return JSON.parse(salida.texto);
  } catch {
    console.error("[ia] respuesta no JSON:", salida.texto.slice(0, 500));
    throw new ErrorGeneracion("La IA devolvió una respuesta con formato inesperado. Volvé a intentar.");
  }
}

/**
 * Genera (o ajusta) una nota. Es un generador asíncrono: va emitiendo
 * eventos de progreso y termina con el resultado validado contra el esquema.
 */
export async function* generarNota(
  pedido: PedidoGeneracion,
  signal?: AbortSignal,
): AsyncGenerator<EventoGeneracion> {
  const consulta: Consulta = {
    sistema: PROMPT_SISTEMA,
    usuario: mensajeUsuario(pedido),
    esquema: ESQUEMA_NOTA,
    nombreEsquema: "nota_administrativa",
    esfuerzo: ESFUERZO,
    maxTokens: 64000,
  };

  yield { tipo: "fase", fase: "analizando" };
  const salida = yield* consultar(consulta, signal);

  const nota = NotaGeneradaSchema.safeParse(leerJson(salida));
  if (!nota.success) {
    console.error("[generar] respuesta fuera de esquema:", nota.error.issues);
    throw new ErrorGeneracion("La IA devolvió una nota incompleta. Volvé a intentar.");
  }

  console.info(
    `[generar] ${pedido.datos.tipo}${pedido.ajuste ? " (ajuste)" : ""} · ${proveedor()} · ${salida.modelo} · ${salida.uso}`,
  );
  yield { tipo: "resultado", nota: nota.data, modelo: salida.modelo };
}

/** Saca los campos del formulario de un texto libre o dictado. */
export async function extraerCampos(texto: string, signal?: AbortSignal): Promise<CamposExtraidos> {
  const consulta: Consulta = {
    sistema: PROMPT_EXTRACCION,
    usuario: `<texto_dictado>\n${texto.replace(/<\/?texto_dictado>/gi, "")}\n</texto_dictado>`,
    esquema: ESQUEMA_EXTRACCION,
    nombreEsquema: "campos_de_la_nota",
    esfuerzo: "low",
    maxTokens: 8000,
  };

  // No hace falta mostrar progreso: se consume el stream y se usa el final.
  const flujo = consultar(consulta, signal);
  let paso = await flujo.next();
  while (!paso.done) paso = await flujo.next();
  const salida = paso.value;

  const campos = CamposExtraidosSchema.safeParse(leerJson(salida));
  if (!campos.success) {
    console.error("[extraer] respuesta fuera de esquema:", campos.error.issues);
    throw new ErrorGeneracion("No se pudo interpretar el texto. Probá de nuevo o completá el formulario a mano.");
  }

  console.info(`[extraer] ${proveedor()} · ${salida.modelo} · ${salida.uso}`);
  return campos.data;
}

/** Traduce los errores de los proveedores a algo que se le pueda mostrar a un agente municipal. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorGeneracion) return error.message;

  if (error instanceof DOMException && error.name === "AbortError") return "Generación cancelada.";
  if (error instanceof Anthropic.APIUserAbortError) return "Generación cancelada.";

  if (error instanceof ErrorOpenRouter) {
    console.error("[ia]", error.message);
    switch (error.status) {
      case 401:
        return "La clave de OpenRouter no es válida o fue revocada. Avisá a la Dirección de IA (revisar OPENROUTER_API_KEY).";
      case 402:
        return "La cuenta de OpenRouter se quedó sin crédito. Avisá a la Dirección de IA.";
      case 403:
        return "El servicio de IA rechazó el contenido del pedido. Revisá el texto y volvé a intentar con una redacción más neutra.";
      case 404:
        return "No hay un proveedor disponible para el modelo con las condiciones pedidas. Avisá a la Dirección de IA (ver OPENROUTER_MODELO y OPENROUTER_PERMITIR_RECOLECCION).";
      case 408:
        return "El servicio de IA tardó demasiado en responder. Volvé a intentar.";
      case 429:
        return "El servicio de IA está recibiendo demasiados pedidos. Esperá un minuto y volvé a intentar.";
      default:
        return "El servicio de IA no está disponible en este momento. Volvé a intentar en unos minutos.";
    }
  }

  if (error instanceof Anthropic.AuthenticationError) {
    return "La clave de la IA no es válida. Avisá a la Dirección de IA (revisar ANTHROPIC_API_KEY).";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "La cuenta de IA no tiene permiso para usar este modelo. Avisá a la Dirección de IA.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "El servicio de IA está recibiendo demasiados pedidos. Esperá un minuto y volvé a intentar.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    console.error("[ia] pedido rechazado:", error.message);
    return "El servicio de IA rechazó el pedido. Si se repite, avisá a la Dirección de IA.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "No se pudo conectar con el servicio de IA. Revisá la conexión y volvé a intentar.";
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`[ia] error de la API ${error.status}:`, error.message);
    return "El servicio de IA no está disponible en este momento. Volvé a intentar en unos minutos.";
  }

  console.error("[ia] error inesperado:", error);
  return "Ocurrió un error inesperado.";
}
