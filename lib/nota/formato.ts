import { MARCADOR, type DatosNota, type NotaGenerada } from "./tipos";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-10-01" → "1 de octubre de 2026" (sin pasar por Date: evita corrimientos de zona horaria). */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** Fecha de hoy en Argentina, en formato ISO, para precargar el formulario. */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Tucuman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Parte un texto en tramos normales y marcadores [[COMPLETAR: ...]], para resaltarlos. */
export function partirMarcadores(texto: string): { texto: string; marcador: boolean }[] {
  const partes: { texto: string; marcador: boolean }[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(MARCADOR)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push({ texto: texto.slice(ultimo, i), marcador: false });
    partes.push({ texto: m[0], marcador: true });
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), marcador: false });
  return partes;
}

// ── Lo que arma el sistema alrededor del texto de la IA ────────────────

/** Los datos del formulario que forman el encabezado y la firma de la nota. */
export type DatosEncabezado = Pick<
  DatosNota,
  | "fecha"
  | "numeroNota"
  | "expediente"
  | "ambito"
  | "destinatarioNombre"
  | "destinatarioCargo"
  | "destinatarioArea"
  | "remitenteNombre"
  | "remitenteCargo"
  | "remitenteArea"
>;

export const LINEA_MUNICIPALIDAD = "De la Municipalidad de San Miguel de Tucumán";

/**
 * El bloque del destinatario, como en las notas de la Municipalidad:
 *   Nombre
 *   Área
 *   De la Municipalidad de San Miguel de Tucumán   (sólo en notas internas)
 * Sin nombre, va el área (o el cargo, si no hay área). Sin ningún dato, un marcador.
 */
export function lineasDestinatario(enc: DatosEncabezado): string[] {
  const nombre = enc.destinatarioNombre.trim();
  const area = enc.destinatarioArea.trim();
  const cargo = enc.destinatarioCargo.trim();
  const lineas: string[] = [];
  if (nombre) lineas.push(nombre);
  // Debajo del nombre va el área; si no hay área, el cargo (para que el destinatario quede identificado).
  if (area) lineas.push(area);
  else if (cargo) lineas.push(cargo);
  if (lineas.length === 0) lineas.push("[[COMPLETAR: destinatario]]");
  if (enc.ambito === "interno") lineas.push(LINEA_MUNICIPALIDAD);
  return lineas;
}

/**
 * Las líneas de datos debajo del destinatario: número de nota y expediente,
 * sólo si se cargaron. La nota no lleva línea de «Referencia»: el asunto que
 * escribe la IA se usa únicamente como asunto del correo y título del archivo.
 */
export function lineasDeDatos(enc: DatosEncabezado): { etiqueta: string; texto: string }[] {
  const lineas: { etiqueta: string; texto: string }[] = [];
  if (enc.numeroNota.trim()) lineas.push({ etiqueta: "Nota N°", texto: enc.numeroNota.trim() });
  if (enc.expediente.trim()) lineas.push({ etiqueta: "Expediente", texto: enc.expediente.trim() });
  return lineas;
}

/**
 * La línea de cargo de la firma: «Cargo - Área». El Intendente firma sólo
 * con su cargo (la Intendencia no hace falta repetirla).
 */
export function lineaCargoFirma(cargo: string, area: string): string {
  const c = cargo.trim();
  const a = area.trim();
  if (/intendent/i.test(c) && /intendencia/i.test(a)) return c;
  return [c, a].filter(Boolean).join(" - ");
}

/**
 * El número de cada bloque del cuerpo (0 si no es un ítem). La misma regla
 * para la hoja, el Word y el texto: los ítems se numeran seguido, un párrafo
 * o un título reinicia la cuenta, y un bloque vacío (así se borra un bloque
 * al editar) no cuenta ni corta la lista.
 */
export function numerarCuerpo(cuerpo: NotaGenerada["cuerpo"]): number[] {
  let n = 0;
  return cuerpo.map((b) => {
    if (!b.texto.trim()) return b.tipo === "item" ? n + 1 : 0;
    if (b.tipo === "item") return ++n;
    n = 0;
    return 0;
  });
}

// ── Datos para completar ───────────────────────────────────────────────

const normalizar = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Lo que va en el producto final (Word, PDF, texto, correo) en lugar de un dato que no se completó. */
export const BLANCO = "________________";

/** Un texto con los datos sin completar convertidos en líneas en blanco, para completar a mano. */
export function conBlancos(texto: string): string {
  return texto.replace(MARCADOR, BLANCO);
}

/** "[[COMPLETAR: plazo en días]]" → "plazo en días". */
export function datoDeMarcador(marcador: string): string {
  return marcador.replace(/^\[\[COMPLETAR:\s*/, "").replace(/\s*\]\]$/, "");
}

/**
 * Completa un dato faltante: reemplaza en toda la nota los marcadores de ese
 * dato por el valor escrito (si el mismo dato aparece dos veces, se completa
 * en los dos lugares).
 */
export function completarDato(nota: NotaGenerada, dato: string, valor: string): NotaGenerada {
  const clave = normalizar(dato);
  const reemplazar = (t: string) => t.replace(MARCADOR, (m, adentro: string) => (normalizar(adentro) === clave ? valor : m));
  return {
    ...nota,
    referencia: reemplazar(nota.referencia),
    cuerpo: nota.cuerpo.map((b) => ({ ...b, texto: reemplazar(b.texto) })),
    cierre: reemplazar(nota.cierre),
    faltantes: nota.faltantes.filter((f) => normalizar(f.dato) !== clave),
  };
}

// ── Revisión y copia ───────────────────────────────────────────────────

/**
 * Los datos que siguen pendientes: exactamente los marcadores que quedan en
 * el texto (si alguien completó uno a mano, deja de figurar), con el motivo
 * que dio la IA cuando lo describió con las mismas palabras. `extra` suma
 * las líneas que arma el sistema (por ejemplo, el bloque del destinatario).
 */
export function faltantesPendientes(nota: NotaGenerada, extra: string[] = []): NotaGenerada["faltantes"] {
  // La referencia no se imprime en la nota: un marcador ahí no cuenta (no habría dónde verlo para completarlo).
  const todo = [...extra, ...nota.cuerpo.map((b) => b.texto), nota.cierre].join("\n");
  const motivos = new Map(nota.faltantes.map((f) => [normalizar(f.dato), f.motivo]));
  const vistos = new Set<string>();
  const pendientes: NotaGenerada["faltantes"] = [];
  for (const m of todo.matchAll(MARCADOR)) {
    const clave = normalizar(m[1]);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    pendientes.push({ dato: m[1].trim(), motivo: motivos.get(clave) ?? "" });
  }
  return pendientes;
}

/**
 * La nota completa como texto plano, para copiar al portapapeles o pegar en
 * un sistema de expedientes. Los datos sin completar salen como líneas en blanco.
 */
export function notaComoTexto(nota: NotaGenerada, enc: DatosEncabezado): string {
  return conBlancos(armarTexto(nota, enc));
}

function armarTexto(nota: NotaGenerada, enc: DatosEncabezado): string {
  const lineas: string[] = [];
  lineas.push(`San Miguel de Tucumán, ${fechaLarga(enc.fecha)}.`, "");
  lineas.push(...lineasDestinatario(enc), "");
  const datos = lineasDeDatos(enc);
  for (const d of datos) lineas.push(`${d.etiqueta}: ${d.texto}`);
  if (datos.length > 0) lineas.push("");
  const numeros = numerarCuerpo(nota.cuerpo);
  let enLista = false;
  nota.cuerpo.forEach((b, i) => {
    if (!b.texto.trim()) return;
    if (b.tipo === "item") {
      lineas.push(`${numeros[i]}. ${b.texto}`);
      enLista = true;
      return;
    }
    if (enLista) lineas.push("");
    enLista = false;
    lineas.push(b.texto, "");
  });
  if (nota.cierre) lineas.push("", nota.cierre);
  lineas.push("", "", "____________________________");
  if (enc.remitenteNombre) lineas.push(enc.remitenteNombre);
  const cargo = lineaCargoFirma(enc.remitenteCargo, enc.remitenteArea);
  if (cargo) lineas.push(cargo);
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
