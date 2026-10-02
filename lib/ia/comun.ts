import "server-only";
import type { Esfuerzo } from "./cliente";
import { fechaLarga } from "@/lib/nota/formato";
import { EXTENSIONES, TONOS, nombreTipo, type PedidoGeneracion } from "@/lib/nota/tipos";

/** Una consulta a la IA con respuesta JSON, sea por OpenRouter o por Anthropic directo. */
export type Consulta = {
  /** Instrucciones estables: van marcadas para caché. */
  sistema: string;
  usuario: string;
  esquema: Record<string, unknown>;
  nombreEsquema: string;
  esfuerzo: Esfuerzo;
  maxTokens: number;
};

/** Lo que entrega cada proveedor al terminar: el JSON crudo y datos para el registro. */
export type Salida = { texto: string; modelo: string; uso: string };

/** Error con un mensaje apto para mostrarle a quien usa el sistema. */
export class ErrorGeneracion extends Error {}

export const MENSAJE_RECHAZO =
  "La IA no redactó esta nota por una política de seguridad. Revisá el motivo y volvé a intentar con una redacción más neutra.";

export const MENSAJE_DEMASIADO_LARGA =
  "La nota quedó incompleta por su extensión. Probá con extensión «Estándar» o dividí el contenido en dos notas.";

const ETIQUETAS = /<\/?(datos_nota|motivo|antecedentes|borrador_actual|instruccion_de_ajuste|fecha_de_la_nota)>/gi;

/** Evita que un texto pegado por el usuario cierre nuestras etiquetas antes de tiempo. */
function limpiar(texto: string): string {
  return texto.replace(ETIQUETAS, "");
}

function linea(etiqueta: string, valor: string): string {
  return `  ${etiqueta}: ${valor ? limpiar(valor) : "(no indicado)"}`;
}

/** El mensaje del usuario: todo lo que cambia entre notas (el prompt de sistema no cambia nunca). */
export function mensajeUsuario({ datos, ajuste }: PedidoGeneracion): string {
  const tono = TONOS.find((t) => t.id === datos.tono)?.nombre ?? datos.tono;
  const extension = EXTENSIONES.find((e) => e.id === datos.extension)?.nombre ?? datos.extension;
  const ambito =
    datos.ambito === "interno"
      ? "interno (área u órgano de la Municipalidad)"
      : "externo (particular, comercio, empresa u otro organismo)";

  const partes = [
    `<fecha_de_la_nota>${fechaLarga(datos.fecha)}</fecha_de_la_nota>`,
    "<datos_nota>",
    `Tipo de nota: ${nombreTipo(datos.tipo)} (id: ${datos.tipo})`,
    `Destinatario, ámbito ${ambito}:`,
    linea("Nombre", datos.destinatarioNombre),
    linea("Cargo", datos.destinatarioCargo),
    linea("Área u organismo", datos.destinatarioArea),
    "Remitente (quien firma):",
    linea("Nombre", datos.remitenteNombre),
    linea("Cargo", datos.remitenteCargo),
    linea("Área", datos.remitenteArea),
    `Expediente: ${datos.expediente ? limpiar(datos.expediente) : "(sin expediente)"} (va en el encabezado; mencionalo en el cuerpo sólo si hace falta)`,
    `Tono pedido: ${tono}`,
    `Extensión pedida: ${extension}`,
    "</datos_nota>",
    "",
    "<motivo>",
    limpiar(datos.motivo),
    "</motivo>",
  ];

  if (datos.antecedentes) {
    partes.push("", "<antecedentes>", limpiar(datos.antecedentes), "</antecedentes>");
  }

  if (ajuste) {
    partes.push(
      "",
      "<borrador_actual>",
      JSON.stringify(ajuste.borrador, null, 2),
      "</borrador_actual>",
      "",
      "<instruccion_de_ajuste>",
      limpiar(ajuste.instruccion),
      "</instruccion_de_ajuste>",
      "",
      "Aplicá el ajuste al borrador y devolvé la nota completa.",
    );
  } else {
    partes.push("", `Redactá la nota siguiendo la guía del tipo "${nombreTipo(datos.tipo)}".`);
  }

  return partes.join("\n");
}
