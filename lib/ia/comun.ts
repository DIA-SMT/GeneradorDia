import "server-only";
import type { Esfuerzo } from "./cliente";
import { fechaLarga } from "@/lib/nota/formato";
import type { Adjunto } from "@/lib/nota/adjuntos";
import { EXTENSIONES, TONOS, nombreTipo, type PedidoGeneracion } from "@/lib/nota/tipos";

/** Una parte del mensaje: texto, o una imagen JPEG en base64. */
export type Parte = { tipo: "texto"; texto: string } | { tipo: "imagen"; datos: string };

/** Una consulta a la IA con respuesta JSON, sea por OpenRouter o por Anthropic directo. */
export type Consulta = {
  /** Instrucciones estables: van marcadas para caché. */
  sistema: string;
  /**
   * Archivos adjuntos, ya presentados (ver partesDeAdjuntos). Van antes del pedido y
   * marcados para caché: un ajuste hecho enseguida los relee a una fracción del costo.
   */
  adjuntos?: Parte[];
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

const ETIQUETAS =
  /<(\/?(?:datos_nota|motivo|antecedentes|borrador_actual|instruccion_de_ajuste|fecha_de_la_nota|documento_adjunto)\b[^<>]{0,200}>)/gi;

/**
 * Evita que un texto del usuario o de un tercero (un archivo adjunto) cierre o
 * abra nuestras etiquetas. No se borran sino que se neutralizan (cambiando «<»
 * por «‹»): si se borraran, los pedazos de alrededor podrían volver a formar
 * una etiqueta («</docu</documento_adjunto>mento_adjunto>»).
 */
function limpiar(texto: string): string {
  return texto.replace(ETIQUETAS, "‹$1");
}

function linea(etiqueta: string, valor: string): string {
  return `  ${etiqueta}: ${valor ? limpiar(valor) : "(no indicado)"}`;
}

/**
 * Los archivos adjuntos como partes del mensaje, en orden: cada uno entre
 * <documento_adjunto>, con su texto y, a continuación, sus páginas escaneadas
 * o fotos como imágenes.
 */
export function partesDeAdjuntos(adjuntos: Adjunto[]): Parte[] {
  return adjuntos.flatMap((a, i): Parte[] => {
    const nombre = limpiar(a.nombre).replace(/["<>\n]/g, " ");
    const texto = a.texto.trim() ? limpiar(a.texto.trim()) : "(sin texto: el contenido está en las imágenes que siguen)";
    const imagenes = a.imagenes.flatMap((img, j): Parte[] => [
      { tipo: "texto", texto: img.pagina ? `Página ${img.pagina} (imagen):` : `Imagen ${j + 1}:` },
      { tipo: "imagen", datos: img.datos },
    ]);
    return [
      { tipo: "texto", texto: `<documento_adjunto numero="${i + 1}" nombre="${nombre}">\n${texto}` },
      ...imagenes,
      { tipo: "texto", texto: "</documento_adjunto>" },
    ];
  });
}

/** El mensaje del usuario: todo lo que cambia entre notas (el prompt de sistema no cambia nunca). */
export function mensajeUsuario({ datos, ajuste, adjuntos }: PedidoGeneracion): string {
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

  if (adjuntos.length) {
    const nombres = adjuntos.map((a, i) => `${i + 1}. ${limpiar(a.nombre)}`).join("; ");
    const cuantos = adjuntos.length === 1 ? "un archivo" : `${adjuntos.length} archivos`;
    partes.push("", `Quien redacta adjuntó ${cuantos} (más arriba, en <documento_adjunto>): ${nombres}.`);
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
