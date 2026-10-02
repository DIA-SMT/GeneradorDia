import { NextResponse } from "next/server";

/**
 * Padrón de funcionarios para autocompletar destinatario y firma, y para
 * prellenar el correo del destinatario.
 *
 * Pasa por el servidor por dos motivos: el navegador no depende de la
 * configuración CORS del servicio de origen, y sólo exponemos lo que el
 * generador usa (nombre, cargo, área y correo institucional). El padrón
 * también trae domicilio y teléfono, que no hacen falta y no se publican.
 */

export const runtime = "nodejs";

const ORIGEN = process.env.FUNCIONARIOS_URL || "https://educacion.smt.gob.ar:5005/api/funcionarios";

type Crudo = { nombre?: unknown; cargo?: unknown; area?: unknown; email?: unknown };
type Funcionario = { nombre: string; cargo: string; area: string; email: string };

let cache: { datos: Funcionario[]; vence: number } | null = null;
const UNA_HORA = 60 * 60 * 1000;

export async function GET() {
  if (cache && cache.vence > Date.now()) {
    return NextResponse.json(cache.datos);
  }
  try {
    const r = await fetch(ORIGEN, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = (await r.json()) as { data?: unknown } | unknown[];
    const lista = Array.isArray(json) ? json : json && typeof json === "object" ? json.data : undefined;
    if (!Array.isArray(lista)) throw new Error("respuesta sin la lista de funcionarios");

    // Un campo que no sea texto se trata como vacío, sin descartar el resto del padrón.
    const texto = (s: unknown) => (typeof s === "string" ? s.trim() : "");
    // El padrón marca los puestos vacantes con "-" o con una o dos letras: se
    // conservan (sirven para dirigir la nota al área) pero sin nombre.
    const util = (s: unknown) => {
      const t = texto(s);
      return /\p{L}{3,}/u.test(t) ? t : "";
    };
    const correo = (s: unknown) => {
      const t = texto(s);
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : "";
    };
    const datos: Funcionario[] = (lista as Crudo[])
      .filter((f) => f && typeof f === "object")
      .map((f) => ({ nombre: util(f.nombre), cargo: util(f.cargo), area: util(f.area), email: correo(f.email) }))
      .filter((f) => f.nombre || f.area)
      .sort((a, b) => (a.nombre || a.area).localeCompare(b.nombre || b.area, "es"));

    // Una respuesta vacía se trata como falla: no reemplaza en caché un padrón que funcionaba.
    if (datos.length === 0) throw new Error("el padrón vino vacío");

    cache = { datos, vence: Date.now() + UNA_HORA };
    return NextResponse.json(datos);
  } catch (error) {
    console.warn("[funcionarios] no se pudo leer el padrón:", error);
    // Sin padrón el formulario funciona igual, con carga manual.
    return NextResponse.json(cache?.datos ?? []);
  }
}
