import "server-only";

/**
 * Límite de pedidos por IP, en memoria. Alcanza para un único servidor y
 * para frenar abusos mientras no haya login; cuando se integre Cidituc,
 * conviene limitar por usuario en lugar de por IP.
 */
const VENTANA_MS = 10 * 60 * 1000;
const MAXIMO = Number(process.env.LIMITE_GENERACIONES) || 20;

const registros = new Map<string, number[]>();

export function ipDe(req: Request): string {
  const reenviada = req.headers.get("x-forwarded-for");
  return reenviada?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Devuelve los segundos a esperar si se pasó del límite, o 0 si puede seguir. */
export function controlarLimite(clave: string): number {
  const ahora = Date.now();
  const recientes = (registros.get(clave) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= MAXIMO) {
    registros.set(clave, recientes);
    return Math.ceil((VENTANA_MS - (ahora - recientes[0])) / 1000);
  }
  recientes.push(ahora);
  registros.set(clave, recientes);
  return 0;
}
