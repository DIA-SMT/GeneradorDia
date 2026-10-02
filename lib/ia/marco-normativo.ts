import "server-only";

/**
 * MARCO NORMATIVO DE REFERENCIA
 *
 * Son las únicas normas que la IA puede citar sin que el usuario las haya
 * escrito. Todo lo que no esté acá ni en los datos de la nota, la IA lo
 * reemplaza por un marcador [[COMPLETAR: norma aplicable]].
 *
 * Por eso esta lista arranca VACÍA a propósito: tiene que cargarla y
 * validarla Asesoría Letrada (o quien el municipio designe), con número,
 * nombre y artículos exactos. Una norma mal citada en un documento oficial
 * es peor que un hueco a completar.
 *
 * Formato de cada entrada:
 *   {
 *     norma: "Ordenanza N° XXXX/AAAA",
 *     titulo: "Nombre o materia de la norma",
 *     usar_para: "Cuándo corresponde citarla (tipos de nota, materias)",
 *     articulos: "Artículos relevantes y qué dicen, en una línea cada uno",
 *   }
 *
 * Cambiar esta lista cambia el prompt de sistema; después de editarla,
 * probar una intimación y un dictamen para ver cómo la usa.
 */
export type NormaDeReferencia = {
  norma: string;
  titulo: string;
  usar_para: string;
  articulos?: string;
};

export const MARCO_NORMATIVO: NormaDeReferencia[] = [];

export function marcoParaPrompt(): string {
  if (MARCO_NORMATIVO.length === 0) {
    return "(Vacío. No hay normas precargadas: sólo podés citar las que aparezcan en los datos que te pase el usuario.)";
  }
  return MARCO_NORMATIVO.map((n) =>
    [
      `<norma>`,
      `${n.norma}: ${n.titulo}`,
      `Usar para: ${n.usar_para}`,
      n.articulos ? `Artículos: ${n.articulos}` : "",
      `</norma>`,
    ]
      .filter(Boolean)
      .join("\n"),
  ).join("\n");
}
