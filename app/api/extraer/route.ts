import { proveedor } from "@/lib/ia/cliente";
import { extraerCampos, mensajeDeError } from "@/lib/ia/generar";
import { controlarLimite, ipDe } from "@/lib/limite";
import { PedidoExtraccionSchema } from "@/lib/nota/tipos";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Completa el formulario a partir de un texto dictado o escrito de corrido. */
export async function POST(req: Request) {
  if (!proveedor()) {
    return Response.json({ mensaje: "El generador no está configurado: falta la clave de la IA en el servidor." }, { status: 503 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ mensaje: "Pedido inválido." }, { status: 400 });
  }

  const pedido = PedidoExtraccionSchema.safeParse(cuerpo);
  if (!pedido.success) {
    return Response.json({ mensaje: pedido.error.issues[0]?.message ?? "Texto inválido." }, { status: 400 });
  }

  const espera = controlarLimite(`extraer:${ipDe(req)}`);
  if (espera > 0) {
    return Response.json(
      { mensaje: `Alcanzaste el máximo de pedidos por ahora. Probá de nuevo en ${Math.ceil(espera / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  try {
    const campos = await extraerCampos(pedido.data.texto, req.signal);
    return Response.json({ campos });
  } catch (error) {
    return Response.json({ mensaje: mensajeDeError(error) }, { status: 502 });
  }
}
