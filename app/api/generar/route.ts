import { proveedor } from "@/lib/ia/cliente";
import { generarNota, mensajeDeError } from "@/lib/ia/generar";
import { controlarLimite, ipDe } from "@/lib/limite";
import { PedidoGeneracionSchema, type EventoGeneracion } from "@/lib/nota/tipos";

export const runtime = "nodejs";
// Con razonamiento alto, una nota larga puede llevar más de un minuto.
export const maxDuration = 300;

function errorJson(mensaje: string, status: number, extra?: HeadersInit) {
  return Response.json({ mensaje }, { status, headers: extra });
}

export async function POST(req: Request) {
  if (!proveedor()) {
    return errorJson("El generador no está configurado: falta la clave de la IA en el servidor.", 503);
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return errorJson("Pedido inválido.", 400);
  }

  const pedido = PedidoGeneracionSchema.safeParse(cuerpo);
  if (!pedido.success) {
    const primero = pedido.error.issues[0];
    return errorJson(primero?.message ?? "Datos incompletos.", 400);
  }

  const espera = controlarLimite(ipDe(req));
  if (espera > 0) {
    return errorJson(
      `Alcanzaste el máximo de notas por ahora. Probá de nuevo en ${Math.ceil(espera / 60)} min.`,
      429,
      { "Retry-After": String(espera) },
    );
  }

  const codificador = new TextEncoder();
  const flujo = new ReadableStream({
    async start(controlador) {
      const enviar = (evento: EventoGeneracion) =>
        controlador.enqueue(codificador.encode(`data: ${JSON.stringify(evento)}\n\n`));
      try {
        for await (const evento of generarNota(pedido.data, req.signal)) enviar(evento);
      } catch (error) {
        if (!req.signal.aborted) enviar({ tipo: "error", mensaje: mensajeDeError(error) });
      } finally {
        controlador.close();
      }
    },
  });

  return new Response(flujo, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
