import type { EventoGeneracion, PedidoGeneracion } from "./tipos";

/**
 * Llama a /api/generar y va entregando los eventos a medida que llegan.
 * El endpoint responde con Server-Sent Events ("data: {...}\n\n").
 */
/** El servidor (Vercel) rechaza pedidos de más de 4,5 MB: se corta antes, con margen. */
const MAXIMO_PEDIDO = 4_300_000;
const MENSAJE_MUY_PESADO =
  "Los archivos adjuntos pesan demasiado para mandarlos juntos. Quitá imágenes o páginas escaneadas y volvé a intentar.";

export async function pedirNota(
  pedido: PedidoGeneracion,
  alEvento: (evento: EventoGeneracion) => void,
  signal: AbortSignal,
): Promise<void> {
  const cuerpo = JSON.stringify(pedido);
  if (cuerpo.length > MAXIMO_PEDIDO) {
    alEvento({ tipo: "error", mensaje: MENSAJE_MUY_PESADO });
    return;
  }

  const r = await fetch("/api/generar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: cuerpo,
    signal,
  });

  if (r.status === 413) {
    alEvento({ tipo: "error", mensaje: MENSAJE_MUY_PESADO });
    return;
  }
  if (!r.ok || !r.body) {
    let mensaje = "No se pudo generar la nota.";
    try {
      const j = (await r.json()) as { mensaje?: string };
      if (j.mensaje) mensaje = j.mensaje;
    } catch {
      /* respuesta sin JSON: queda el mensaje genérico */
    }
    alEvento({ tipo: "error", mensaje });
    return;
  }

  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let resto = "";
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    resto += value;
    const bloques = resto.split("\n\n");
    resto = bloques.pop() ?? "";
    for (const bloque of bloques) {
      const linea = bloque.split("\n").find((l) => l.startsWith("data: "));
      if (!linea) continue;
      try {
        alEvento(JSON.parse(linea.slice(6)) as EventoGeneracion);
      } catch {
        /* evento cortado: se ignora */
      }
    }
  }
}
