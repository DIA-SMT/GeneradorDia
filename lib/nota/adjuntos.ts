import { z } from "zod";

/**
 * Archivos que se adjuntan para darle contexto a la IA: la nota que se
 * responde, un expediente, una resolución, fotos de una inspección.
 *
 * Se leen en el navegador (lib/nota/leer-archivo.ts) y viajan ya
 * convertidos: el texto como texto, y las páginas escaneadas y las fotos
 * como imágenes JPEG achicadas. Así el envío es liviano (el servidor acepta
 * hasta 4,5 MB por pedido) y el costo queda acotado. No se guardan en
 * ningún lado: se usan sólo para redactar la nota y sus ajustes.
 */

export const LIMITES_ADJUNTOS = {
  archivos: 5,
  /** Tamaño máximo del archivo original que se acepta leer. */
  bytesArchivo: 25 * 1024 * 1024,
  /** Páginas de PDF que se leen por archivo (las siguientes se ignoran y se avisa). */
  paginasPorArchivo: 40,
  /** Caracteres de texto entre todos los archivos (unas 25.000 palabras). */
  caracteres: 150_000,
  /** Imágenes (fotos o páginas escaneadas) entre todos los archivos. */
  imagenes: 8,
  /**
   * Lado mayor de cada imagen, en píxeles: una hoja A4 escaneada queda a unos 170 ppp, con
   * números y sellos legibles (unos 3.700 tokens por página).
   */
  ladoImagen: 2000,
  /** Tamaño de cada imagen ya convertida, en caracteres base64 (unos 330 KB de JPEG). */
  base64PorImagen: 450_000,
  /** Entre todas las imágenes, en caracteres base64 (unos 2,4 MB de JPEG). */
  base64Total: 3_200_000,
} as const;

const ImagenSchema = z.object({
  /** Página del PDF de la que sale, si sale de un PDF. */
  pagina: z.number().int().positive().max(10_000).optional(),
  /** JPEG en base64 (sin el prefijo «data:»). */
  datos: z
    .string()
    .max(LIMITES_ADJUNTOS.base64PorImagen, "Una imagen adjunta es demasiado grande.")
    .regex(/^\/9j\/[A-Za-z0-9+/]*={0,2}$/, "Una imagen adjunta no es un JPEG válido."),
});

export const AdjuntoSchema = z
  .object({
    // Un nombre larguísimo no tiene por qué hacer fallar el pedido: se recorta.
    nombre: z
      .string()
      .trim()
      .min(1, "Un archivo adjunto no tiene nombre.")
      .max(1000, "El nombre de un archivo adjunto es demasiado largo.")
      .transform((n) => n.slice(0, 200)),
    /** Texto del archivo (en un PDF, sólo de las páginas con texto, separadas por «— Página N —»). */
    texto: z
      .string()
      .max(LIMITES_ADJUNTOS.caracteres, "Los archivos adjuntos tienen demasiado texto. Dejá sólo lo necesario.")
      .default(""),
    imagenes: z
      .array(ImagenSchema)
      .max(LIMITES_ADJUNTOS.imagenes, "Hay demasiadas imágenes o páginas escaneadas adjuntas.")
      .default([]),
  })
  .refine((a) => a.texto.trim() !== "" || a.imagenes.length > 0, "Un archivo adjunto llegó vacío.");

export const AdjuntosSchema = z
  .array(AdjuntoSchema)
  .max(LIMITES_ADJUNTOS.archivos, `Se pueden adjuntar hasta ${LIMITES_ADJUNTOS.archivos} archivos.`)
  .superRefine((adjuntos, ctx) => {
    const caracteres = adjuntos.reduce((n, a) => n + a.texto.length, 0);
    const imagenes = adjuntos.flatMap((a) => a.imagenes);
    const base64 = imagenes.reduce((n, i) => n + i.datos.length, 0);
    if (caracteres > LIMITES_ADJUNTOS.caracteres) {
      ctx.addIssue({ code: "custom", message: "Los archivos adjuntos tienen demasiado texto. Dejá sólo lo necesario." });
    }
    if (imagenes.length > LIMITES_ADJUNTOS.imagenes || base64 > LIMITES_ADJUNTOS.base64Total) {
      ctx.addIssue({ code: "custom", message: "Hay demasiadas imágenes o páginas escaneadas adjuntas." });
    }
  });

export type Adjunto = z.infer<typeof AdjuntoSchema>;
