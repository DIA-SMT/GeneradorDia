import { z } from "zod";

/**
 * Tipos de nota y forma de los datos. Este archivo lo usan el navegador y el
 * servidor; las instrucciones de redacción de cada tipo viven aparte, en
 * lib/ia/guias-por-tipo.ts, y sólo las lee el servidor.
 */

export const TIPOS_NOTA = [
  { id: "intimacion", nombre: "Intimación", ayuda: "Exige el cumplimiento de una obligación en un plazo, bajo apercibimiento." },
  { id: "pedido", nombre: "Pedido", ayuda: "Requiere bienes, servicios, información o una tarea concreta a otra área." },
  { id: "notificacion", nombre: "Notificación", ayuda: "Comunica formalmente un acto o una decisión y sus efectos." },
  { id: "pase", nombre: "Pase", ayuda: "Remite actuaciones a otra área para que intervenga." },
  { id: "informe", nombre: "Informe", ayuda: "Expone hechos, análisis y conclusiones sobre un asunto." },
  { id: "derivacion", nombre: "Derivación", ayuda: "Envía un asunto al área competente por razón de la materia." },
  { id: "dictamen", nombre: "Dictamen básico", ayuda: "Opinión técnica o jurídica fundada, no vinculante." },
  { id: "solicitud", nombre: "Solicitud", ayuda: "Pide una autorización, aprobación o recurso a un superior." },
  { id: "respuesta", nombre: "Respuesta", ayuda: "Contesta una nota o presentación recibida, punto por punto." },
  { id: "circular", nombre: "Circular", ayuda: "Instrucción o comunicación general para varias áreas o agentes." },
] as const;

export type TipoNotaId = (typeof TIPOS_NOTA)[number]["id"];

const IDS = TIPOS_NOTA.map((t) => t.id) as [TipoNotaId, ...TipoNotaId[]];

export function nombreTipo(id: TipoNotaId): string {
  return TIPOS_NOTA.find((t) => t.id === id)?.nombre ?? id;
}

export const TONOS = [
  { id: "institucional", nombre: "Institucional (estándar)" },
  { id: "firme", nombre: "Firme" },
  { id: "cordial", nombre: "Cordial" },
  { id: "urgente", nombre: "Urgente" },
] as const;

export const EXTENSIONES = [
  { id: "breve", nombre: "Breve" },
  { id: "estandar", nombre: "Estándar" },
  { id: "detallada", nombre: "Detallada" },
] as const;

const texto = (max: number) => z.string().trim().max(max);

/** Lo que completa la persona en el formulario. */
export const DatosNotaSchema = z.object({
  tipo: z.enum(IDS),
  ambito: z.enum(["interno", "externo"]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  numeroNota: texto(40).default(""),
  expediente: texto(80).default(""),
  destinatarioNombre: texto(160).default(""),
  destinatarioCargo: texto(160).default(""),
  destinatarioArea: texto(200).default(""),
  remitenteNombre: texto(160).default(""),
  remitenteCargo: texto(160).default(""),
  remitenteArea: texto(200).default(""),
  motivo: texto(6000).min(10, "Contá con un poco más de detalle qué necesitás comunicar."),
  antecedentes: texto(20000).default(""),
  tono: z.enum(TONOS.map((t) => t.id) as [string, ...string[]]).default("institucional"),
  extension: z.enum(EXTENSIONES.map((e) => e.id) as [string, ...string[]]).default("estandar"),
});

export type DatosNota = z.infer<typeof DatosNotaSchema>;

/**
 * Lo que devuelve la IA (validado contra lib/ia/esquema.ts). El resto de la
 * nota (membrete, fecha, destinatario, número, expediente y firma) lo arma
 * el sistema con los datos del formulario.
 */
export const NotaGeneradaSchema = z.object({
  /** Si viene con texto, la IA no redactó: necesita que quien redacta le responda esta pregunta. */
  aclaracion_necesaria: z.string().default(""),
  referencia: z.string(),
  cuerpo: z.array(
    z.object({
      tipo: z.enum(["parrafo", "titulo", "item"]),
      texto: z.string(),
    }),
  ),
  cierre: z.string(),
  faltantes: z.array(z.object({ dato: z.string(), motivo: z.string() })),
  advertencias: z.array(
    z.object({ nivel: z.enum(["alta", "media", "baja"]), texto: z.string() }),
  ),
  normas_citadas: z.array(
    z.object({
      norma: z.string(),
      origen: z.enum(["datos_del_usuario", "marco_de_referencia"]),
    }),
  ),
});

export type NotaGenerada = z.infer<typeof NotaGeneradaSchema>;
export type BloqueCuerpo = NotaGenerada["cuerpo"][number];

/** Pedido al endpoint: una nota nueva, o un ajuste sobre un borrador. */
export const PedidoGeneracionSchema = z.object({
  datos: DatosNotaSchema,
  ajuste: z
    .object({
      borrador: NotaGeneradaSchema,
      instruccion: texto(2000).min(3),
    })
    .optional(),
});

export type PedidoGeneracion = z.infer<typeof PedidoGeneracionSchema>;

/**
 * Campos del formulario que la IA saca de un texto libre o dictado.
 * Cadena vacía = no se mencionó.
 */
export const CamposExtraidosSchema = z.object({
  tipo: z.union([z.enum(IDS), z.literal("")]),
  ambito: z.enum(["interno", "externo", ""]),
  destinatarioNombre: z.string(),
  destinatarioCargo: z.string(),
  destinatarioArea: z.string(),
  remitenteNombre: z.string(),
  remitenteCargo: z.string(),
  remitenteArea: z.string(),
  expediente: z.string(),
  motivo: z.string(),
  antecedentes: z.string(),
  tono: z.enum(TONOS.map((t) => t.id) as [string, ...string[]]),
});

export type CamposExtraidos = z.infer<typeof CamposExtraidosSchema>;

export const PedidoExtraccionSchema = z.object({
  texto: texto(8000).min(15, "Contá un poco más: con eso todavía no alcanza para armar la nota."),
});

/** Lo que el endpoint le va contando al navegador mientras la IA trabaja. */
export type EventoGeneracion =
  | { tipo: "fase"; fase: "analizando" | "redactando" }
  | { tipo: "razonamiento"; texto: string }
  | { tipo: "resultado"; nota: NotaGenerada; modelo: string }
  | { tipo: "error"; mensaje: string };

/** Marcador que la IA deja donde falta un dato. */
export const MARCADOR = /\[\[COMPLETAR:\s*([^\]]+?)\s*\]\]/g;
