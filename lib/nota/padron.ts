import type { CamposExtraidos, DatosNota } from "./tipos";

/**
 * Padrón de funcionarios (vía /api/funcionarios): búsqueda para el
 * autocompletado, opciones de cada campo y cruce con lo que se dictó.
 *
 * Forma de los datos: un registro por área, con su titular. Los puestos
 * vacantes vienen sin nombre. Los cargos vienen en forma doble
 * ("Director/a"), que hay que resolver antes de que lleguen a la firma.
 */
export type Funcionario = { nombre: string; cargo: string; area: string; email?: string };

const TITULOS = new Set(["ing", "dr", "dra", "lic", "arq", "cpn", "cr", "cra", "prof", "sr", "sra", "srta", "abog", "mg", "med", "tec"]);

/** Minúsculas, sin acentos ni signos: "Secretaría de Obras Públicas" → "secretaria de obras publicas". */
export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const palabras = (s: string) => normalizar(s).split(" ").filter((t) => t.length > 1 && !TITULOS.has(t));

/** El nombre sin el título adelante: "Ing. Juan Pérez" → "juan perez" (para ordenar y comparar nombres). */
const sinTitulo = (s: string) => palabras(s).join(" ");

/** Dos nombres son la misma persona si coinciden sin título: "Juan Pérez" = "Ing. Juan Pérez". */
const mismoNombre = (a: string, b: string) => {
  const x = sinTitulo(a) || normalizar(a);
  return Boolean(x) && x === (sinTitulo(b) || normalizar(b));
};

// ── Opciones para el autocompletado ────────────────────────────────────

export type Opcion<T> = {
  clave: string;
  titulo: string;
  detalle?: string;
  /** Texto normalizado contra el que se busca (título + detalle). */
  buscable: string;
  dato: T;
};

/**
 * Personas con nombre cargado, ordenadas por nombre sin el título (si no,
 * quedan agrupadas por "Arq.", "Dr.", "Ing.", …). Se buscan por nombre,
 * área o cargo, incluidas las dos formas del cargo ("directora" encuentra a
 * quien figura como "Director/a").
 */
export function opcionesDePersonas(padron: Funcionario[]): Opcion<Funcionario>[] {
  return padron
    .filter((f) => f.nombre)
    .sort((a, b) => sinTitulo(a.nombre).localeCompare(sinTitulo(b.nombre), "es"))
    .map((f, i) => ({
      clave: `p${i}`,
      titulo: f.nombre,
      detalle: [f.cargo, f.area].filter(Boolean).join(" · "),
      buscable: normalizar(`${f.nombre} ${f.cargo} ${(formasDeCargo(f.cargo) ?? []).join(" ")} ${f.area}`),
      dato: f,
    }));
}

/** Todas las áreas del padrón, con su titular (o la aclaración de que no hay uno cargado). */
export function opcionesDeAreas(padron: Funcionario[]): Opcion<Funcionario>[] {
  return padron
    .filter((f) => f.area)
    .map((f, i) => ({
      clave: `a${i}`,
      titulo: f.area,
      detalle: f.nombre ? `Titular: ${f.nombre}` : "Sin titular cargado en el padrón",
      buscable: normalizar(`${f.area} ${f.nombre}`),
      dato: f,
    }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
}

/** Cargos del padrón ya resueltos en masculino y femenino ("Director", "Directora", …). */
export function opcionesDeCargos(padron: Funcionario[]): Opcion<string>[] {
  const cargos = new Set<string>();
  for (const f of padron) {
    if (!f.cargo) continue;
    const formas = formasDeCargo(f.cargo);
    if (formas) formas.forEach((c) => cargos.add(c));
    else cargos.add(f.cargo);
  }
  return [...cargos]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((c, i) => ({ clave: `c${i}`, titulo: c, buscable: normalizar(c), dato: c }));
}

/**
 * Filtra y ordena las opciones para lo que se escribió. Cada palabra
 * escrita tiene que aparecer en algún lado (nombre, cargo o área); primero
 * van las que empiezan igual que lo escrito. Sin consulta se muestran todas:
 * el padrón tiene alrededor de cien registros y la lista tiene scroll.
 *
 * Si lo escrito es un cargo en forma doble ("Director/a", típico después de
 * elegir a alguien del padrón), se ofrecen sus dos formas.
 */
export function filtrarOpciones<T>(opciones: Opcion<T>[], consulta: string): Opcion<T>[] {
  const formas = formasDeCargo(consulta);
  if (formas) {
    const buscadas = formas.map(normalizar);
    return opciones.filter((o) => buscadas.some((f) => o.buscable.startsWith(f)));
  }
  const q = normalizar(consulta);
  if (!q) return opciones;
  const tokens = q.split(" ");
  const puntaje = (o: Opcion<T>) => {
    const titulo = sinTitulo(o.titulo) || normalizar(o.titulo);
    if (titulo.startsWith(q)) return 0;
    if (titulo.split(" ").some((p) => p.startsWith(tokens[0]))) return 1;
    return 2;
  };
  return opciones
    .filter((o) => tokens.every((t) => o.buscable.includes(t)))
    .map((o, i) => ({ o, p: puntaje(o), i }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.o);
}

// ── Cargos en forma doble ──────────────────────────────────────────────

// La base necesita al menos tres letras: así "y/o" no se toma como forma doble.
const DOBLE = /(\p{L}{3,})\/([ao])(?!\p{L})/u;

/** "SubSecretario" → "Subsecretario": el padrón trae mayúsculas internas. */
const ajustarMayusculas = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Femenino a partir del masculino: Director → Directora, Secretario → Secretaria, Intendente → Intendenta. */
function femeninoDe(base: string): string {
  if (/[oe]$/i.test(base)) return `${base.slice(0, -1)}a`;
  return `${base}a`;
}

/** Masculino a partir del femenino: Directora → Director, Abogada → Abogado, Presidenta → Presidente. */
function masculinoDe(base: string): string {
  if (/ora$/i.test(base)) return base.slice(0, -1);
  if (/nta$/i.test(base)) return `${base.slice(0, -1)}e`;
  if (/a$/i.test(base)) return `${base.slice(0, -1)}o`;
  return base;
}

/**
 * Resuelve un cargo en forma doble en sus dos formas, o null si no la tiene.
 * "Director/a" → ["Director", "Directora"]; "Intendente/a" → ["Intendente", "Intendenta"];
 * "Jefe/a de Compras" → ["Jefe de Compras", "Jefa de Compras"]; "Directora/o" → ["Director", "Directora"].
 */
export function formasDeCargo(cargo: string): [string, string] | null {
  const m = cargo.match(DOBLE);
  if (!m) return null;
  const [completo, base, sufijo] = m;
  const masculino = sufijo === "a" ? base : masculinoDe(base);
  const femenino = sufijo === "a" ? femeninoDe(base) : base;
  const formas: [string, string] = [
    cargo.replace(completo, ajustarMayusculas(masculino)),
    cargo.replace(completo, ajustarMayusculas(femenino)),
  ];
  return formas[0] === formas[1] ? null : formas;
}

// ── Cruces ─────────────────────────────────────────────────────────────

/** El titular registrado para un área (comparación exacta, sin acentos ni mayúsculas). */
export function titularDe(padron: Funcionario[], area: string): Funcionario | null {
  const buscada = normalizar(area);
  if (!buscada) return null;
  const candidatos = padron.filter((f) => normalizar(f.area) === buscada);
  return candidatos.length === 1 ? candidatos[0] : null;
}

/** ¿Este nombre es el de alguien del padrón (con o sin título)? Sirve para saber si un campo se completó desde el padrón. */
export function esDelPadron(padron: Funcionario[], nombre: string): boolean {
  return padron.some((f) => f.nombre && mismoNombre(f.nombre, nombre));
}

/**
 * Correo institucional del destinatario según el padrón: el de la persona,
 * si está; si no hay nombre escrito, el del titular del área. Con un nombre
 * que no figura en el padrón no se propone nada: sería el correo de otra persona.
 */
export function correoDe(padron: Funcionario[], nombre: string, area: string): string {
  if (normalizar(nombre)) {
    return padron.find((f) => f.nombre && mismoNombre(f.nombre, nombre))?.email ?? "";
  }
  return titularDe(padron, area)?.email ?? "";
}

/**
 * Busca en el padrón al destinatario que se dictó y dice cómo lo encontró.
 * Sólo devuelve un resultado si es inequívoco: ante dos candidatos, mejor no
 * elegir. Si se dictó un área, una coincidencia de nombre con alguien de
 * otra área no vale (un nombre de pila suelto coincide con mucha gente).
 */
export function buscarEnPadron(
  padron: Funcionario[],
  nombre: string,
  area: string,
): { f: Funcionario; por: "nombre" | "area" } | null {
  const titular = titularDe(padron, area);
  const buscadas = palabras(nombre);
  if (buscadas.length > 0) {
    const porNombre = padron.filter((f) => {
      const delPadron = palabras(f.nombre);
      return delPadron.length > 0 && buscadas.every((p) => delPadron.includes(p));
    });
    const candidato = porNombre.length === 1 ? porNombre[0] : null;
    if (candidato && (!titular || candidato === titular)) return { f: candidato, por: "nombre" };
  }
  return titular ? { f: titular, por: "area" } : null;
}

const ETIQUETAS: Partial<Record<keyof DatosNota, string>> = {
  tipo: "tipo de nota",
  destinatarioNombre: "destinatario",
  remitenteNombre: "quién firma",
  expediente: "expediente",
  motivo: "contenido",
  antecedentes: "antecedentes",
  tono: "tono",
};

/**
 * Convierte lo que extrajo la IA en cambios para el formulario. Sólo pisa
 * los campos que vinieron con dato: lo que no se dictó queda como estaba
 * (por ejemplo, quién firma, que se recuerda en el navegador).
 */
export function aplicarExtraccion(
  campos: CamposExtraidos,
  padron: Funcionario[],
): { cambios: Partial<DatosNota>; completados: string[] } {
  const cambios: Partial<DatosNota> = {};

  if (campos.tipo) cambios.tipo = campos.tipo;
  if (campos.ambito) cambios.ambito = campos.ambito;
  if (campos.tono && campos.tono !== "institucional") cambios.tono = campos.tono;

  const textos = [
    "destinatarioNombre",
    "destinatarioCargo",
    "destinatarioArea",
    "remitenteNombre",
    "remitenteCargo",
    "remitenteArea",
    "expediente",
    "motivo",
    "antecedentes",
  ] as const;
  for (const k of textos) if (campos[k].trim()) cambios[k] = campos[k].trim();

  // Un destinatario dictado reemplaza al anterior entero: su cargo y su área
  // no pueden quedar mezclados con los de quien estaba antes en el formulario.
  if (campos.destinatarioNombre.trim()) {
    cambios.destinatarioCargo = campos.destinatarioCargo.trim();
    cambios.destinatarioArea = campos.destinatarioArea.trim();
  }

  // Si el destinatario es del municipio, se completa con los datos oficiales del padrón.
  if (campos.ambito !== "externo") {
    const hallado = buscarEnPadron(padron, campos.destinatarioNombre, campos.destinatarioArea);
    if (hallado) {
      const { f, por } = hallado;
      cambios.ambito = "interno";
      // El nombre del titular sólo reemplaza al dictado si es la misma persona o si no se dictó ninguno.
      if (f.nombre && (por === "nombre" || !campos.destinatarioNombre.trim())) cambios.destinatarioNombre = f.nombre;
      cambios.destinatarioCargo = campos.destinatarioCargo.trim() || (por === "nombre" || !campos.destinatarioNombre.trim() ? f.cargo : "");
      if (f.area) cambios.destinatarioArea = f.area;
    }
  }

  const completados = Object.keys(cambios)
    .map((k) => ETIQUETAS[k as keyof DatosNota])
    .filter((e): e is string => Boolean(e));
  if (!completados.includes("destinatario") && (cambios.destinatarioArea || cambios.destinatarioCargo)) {
    completados.push("destinatario");
  }
  return { cambios, completados: [...new Set(completados)] };
}
