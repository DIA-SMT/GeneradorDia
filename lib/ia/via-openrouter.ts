import "server-only";
import { MODELO_OPENROUTER } from "./cliente";
import { ErrorGeneracion, MENSAJE_DEMASIADO_LARGA, MENSAJE_RECHAZO, type Consulta, type Salida } from "./comun";
import type { EventoGeneracion } from "@/lib/nota/tipos";

/**
 * Consulta a través de OpenRouter (API compatible con OpenAI), en
 * streaming. Mismo prompt, mismo esquema y mismo esfuerzo de razonamiento
 * que el camino de Anthropic directo.
 *
 * Diferencia: el relevo automático de modelo ante un rechazo por política
 * de seguridad es una función de la API de Anthropic y acá no existe.
 */

const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

/** Error HTTP de OpenRouter, con el código para traducirlo a un mensaje claro. */
export class ErrorOpenRouter extends Error {
  constructor(
    public readonly status: number,
    detalle: string,
  ) {
    super(`OpenRouter ${status}: ${detalle}`);
  }
}

type Fragmento = {
  model?: string;
  error?: { message?: string; code?: number | string };
  choices?: {
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_details?: { type?: string; text?: string; summary?: string }[];
    };
    finish_reason?: string | null;
    native_finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

function detalleDeError(cuerpo: string): string {
  try {
    const j = JSON.parse(cuerpo) as { error?: { message?: string } };
    return j.error?.message ?? cuerpo.slice(0, 300);
  } catch {
    return cuerpo.slice(0, 300);
  }
}

export async function* viaOpenRouter(c: Consulta, signal?: AbortSignal): AsyncGenerator<EventoGeneracion, Salida> {
  const cabeceras: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    // Identifican la aplicación en el panel de OpenRouter, para separar este
    // consumo del de otros sistemas del municipio.
    "X-Title": "Generador de Notas - Municipalidad de San Miguel de Tucuman",
  };
  if (process.env.PUBLIC_URL) cabeceras["HTTP-Referer"] = process.env.PUBLIC_URL;

  const r = await fetch(URL_OPENROUTER, {
    method: "POST",
    signal,
    headers: cabeceras,
    body: JSON.stringify({
      model: MODELO_OPENROUTER,
      max_tokens: c.maxTokens,
      stream: true,
      reasoning: { effort: c.esfuerzo },
      response_format: {
        type: "json_schema",
        json_schema: { name: c.nombreEsquema, strict: true, schema: c.esquema },
      },
      provider: {
        // Sólo proveedores que soporten todo lo que pedimos (en especial, el esquema JSON).
        require_parameters: true,
        // Las notas pueden traer datos de vecinos: por defecto, sólo proveedores que no los guardan.
        data_collection: process.env.OPENROUTER_PERMITIR_RECOLECCION === "1" ? "allow" : "deny",
      },
      messages: [
        // Las instrucciones no cambian entre pedidos: se marcan para caché.
        { role: "system", content: [{ type: "text", text: c.sistema, cache_control: { type: "ephemeral" } }] },
        { role: "user", content: c.usuario },
      ],
    }),
  });

  if (!r.ok || !r.body) {
    throw new ErrorOpenRouter(r.status, detalleDeError(await r.text().catch(() => "")));
  }

  let texto = "";
  let modelo = MODELO_OPENROUTER;
  let fin: string | null = null;
  let finNativo: string | null = null;
  let uso: Fragmento["usage"];
  let redactando = false;
  let resto = "";

  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    resto += value;
    // Un trozo de red puede cortar un evento por la mitad: se procesan las
    // líneas completas y lo que sobra espera al siguiente trozo.
    const lineas = resto.split("\n");
    resto = lineas.pop() ?? "";

    for (const cruda of lineas) {
      const linea = cruda.trim();
      // Las líneas que empiezan con ":" son comentarios de OpenRouter para mantener viva la conexión.
      if (!linea.startsWith("data:")) continue;
      const carga = linea.slice(5).trim();
      if (carga === "[DONE]") continue;

      let f: Fragmento;
      try {
        f = JSON.parse(carga) as Fragmento;
      } catch {
        continue;
      }

      if (f.error) throw new ErrorOpenRouter(Number(f.error.code) || 502, f.error.message ?? "error en el stream");
      if (f.model) modelo = f.model;
      if (f.usage) uso = f.usage;

      const opcion = f.choices?.[0];
      if (!opcion) continue;
      const delta = opcion.delta;

      // El razonamiento llega en reasoning_details (o, en algunos casos, como texto suelto en reasoning).
      const razon = delta?.reasoning_details?.length
        ? delta.reasoning_details.map((d) => d.text ?? d.summary ?? "").join("")
        : (delta?.reasoning ?? "");
      if (razon) yield { tipo: "razonamiento", texto: razon };

      if (delta?.content) {
        if (!redactando) {
          redactando = true;
          yield { tipo: "fase", fase: "redactando" };
        }
        texto += delta.content;
      }

      if (opcion.finish_reason) fin = opcion.finish_reason;
      if (opcion.native_finish_reason) finNativo = opcion.native_finish_reason;
    }
  }

  if (finNativo === "refusal" || fin === "content_filter") throw new ErrorGeneracion(MENSAJE_RECHAZO);
  if (fin === "length" || finNativo === "max_tokens") throw new ErrorGeneracion(MENSAJE_DEMASIADO_LARGA);
  if (fin === "error") throw new ErrorGeneracion("El servicio de IA cortó la respuesta. Volvé a intentar.");

  const cache = uso?.prompt_tokens_details;
  return {
    texto,
    modelo,
    uso:
      `entrada ${uso?.prompt_tokens ?? "?"} · caché leída ${cache?.cached_tokens ?? 0} · ` +
      `caché escrita ${cache?.cache_write_tokens ?? 0} · salida ${uso?.completion_tokens ?? "?"} ` +
      `(razonamiento ${uso?.completion_tokens_details?.reasoning_tokens ?? "?"}) · ` +
      `costo USD ${uso?.cost?.toFixed(4) ?? "?"}`,
  };
}
