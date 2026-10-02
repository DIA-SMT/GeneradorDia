import "server-only";
import { MODELO_ANTHROPIC, getCliente } from "./cliente";
import { ErrorGeneracion, MENSAJE_DEMASIADO_LARGA, MENSAJE_RECHAZO, type Consulta, type Salida } from "./comun";
import type { EventoGeneracion } from "@/lib/nota/tipos";

/** Consulta a la API de Anthropic con el SDK oficial, en streaming. */
export async function* viaAnthropic(c: Consulta, signal?: AbortSignal): AsyncGenerator<EventoGeneracion, Salida> {
  const stream = getCliente().beta.messages.stream(
    {
      model: MODELO_ANTHROPIC,
      max_tokens: c.maxTokens,
      // Si el modelo declina por una política de seguridad, la API reintenta
      // sola con el modelo de respaldo recomendado para ese caso.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive", display: "summarized" },
      output_config: {
        effort: c.esfuerzo,
        format: { type: "json_schema", schema: c.esquema },
      },
      system: [{ type: "text", text: c.sistema, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: c.usuario }],
    },
    { signal },
  );

  for await (const evento of stream) {
    if (evento.type === "content_block_start" && evento.content_block.type === "text") {
      yield { tipo: "fase", fase: "redactando" };
    } else if (evento.type === "content_block_delta" && evento.delta.type === "thinking_delta") {
      yield { tipo: "razonamiento", texto: evento.delta.thinking };
    }
  }

  const final = await stream.finalMessage();

  if (final.stop_reason === "refusal") throw new ErrorGeneracion(MENSAJE_RECHAZO);
  if (final.stop_reason === "max_tokens") throw new ErrorGeneracion(MENSAJE_DEMASIADO_LARGA);

  // Si hubo un relevo de modelo a mitad de camino, vale sólo el texto posterior al último relevo.
  const ultimoRelevo = final.content.findLastIndex((b) => b.type === "fallback");
  const texto = final.content
    .slice(ultimoRelevo + 1)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");

  const u = final.usage;
  return {
    texto,
    modelo: final.model,
    uso: `entrada ${u.input_tokens} · caché ${u.cache_read_input_tokens ?? 0} · salida ${u.output_tokens}`,
  };
}
