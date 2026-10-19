"use client";

import { LIMITES_ADJUNTOS, type Adjunto } from "./adjuntos";

/**
 * Lee en el navegador un archivo adjunto y lo deja listo para mandar a la IA:
 *   · PDF: el texto de cada página; las páginas sin texto (escaneadas) van
 *     como imagen.
 *   · Word (.docx): el texto.
 *   · Imágenes: achicadas a JPEG.
 *   · Texto (.txt, .md, .csv): tal cual.
 * Las librerías de PDF y de Word se cargan recién cuando hacen falta.
 */

export const TIPOS_ACEPTADOS =
  ".pdf,.docx,.doc,.txt,.md,.csv,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif,application/pdf,image/*,text/plain";

/** Error con un mensaje para mostrar junto al archivo. */
export class ErrorLectura extends Error {
  constructor(
    mensaje: string,
    /** Si quedó afuera sólo por falta de lugar: se vuelve a leer si se quita otro archivo. */
    readonly porLugar = false,
  ) {
    super(mensaje);
  }
}

/** Lo que queda libre del máximo de un pedido (ver LIMITES_ADJUNTOS). */
export type Libre = { caracteres: number; imagenes: number; base64: number };

export type Lectura = {
  adjunto: Adjunto;
  detalle: string;
  aviso?: string;
  /** Si se recortó por falta de lugar (se vuelve a leer si se quita otro archivo). */
  limitado?: boolean;
};

const SIN_LUGAR =
  "No entra: ya se usó todo el espacio para adjuntos. Si quitás otro archivo, este se lee solo.";

/** Una página con menos caracteres que esto y una imagen va también como imagen (escaneo con pie de texto). */
const POCO_TEXTO_PAGINA = 400;

/** Una página de PDF con menos caracteres que esto se toma como escaneada. */
const MINIMO_TEXTO_PAGINA = 40;

export async function leerArchivo(archivo: File, libre: Libre): Promise<Lectura> {
  if (archivo.size > LIMITES_ADJUNTOS.bytesArchivo) {
    throw new ErrorLectura("Pesa más de 25 MB. Adjuntá sólo las páginas que hacen falta.");
  }
  if (libre.caracteres <= 0 && libre.imagenes <= 0) {
    throw new ErrorLectura(SIN_LUGAR, true);
  }

  // El nombre viaja a la IA: se recorta para no pasar el máximo que acepta el servidor.
  const nombre = (archivo.name.trim() || "archivo").slice(0, 150);
  const extension = archivo.name.toLowerCase().split(".").pop() ?? "";
  const tipo = archivo.type;

  if (tipo === "application/pdf" || extension === "pdf") return leerPdf(archivo, nombre, libre);
  if (extension === "docx" || extension === "doc") return leerWord(archivo, nombre, libre);
  if (tipo.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif"].includes(extension)) {
    return leerImagen(archivo, nombre, libre);
  }
  if (tipo.startsWith("text/") || ["txt", "md", "csv"].includes(extension)) return leerTexto(archivo, nombre, libre);

  throw new ErrorLectura("Este tipo de archivo no se puede leer. Usá PDF, Word (.docx), una imagen o texto.");
}

// ---------------------------------------------------------------- texto

async function leerTexto(archivo: File, nombre: string, libre: Libre): Promise<Lectura> {
  const datos = new Uint8Array(await archivo.arrayBuffer());
  let texto: string;
  if (datos[0] === 0xff && datos[1] === 0xfe) {
    texto = new TextDecoder("utf-16le").decode(datos);
  } else if (datos[0] === 0xfe && datos[1] === 0xff) {
    texto = new TextDecoder("utf-16be").decode(datos);
  } else {
    // Un archivo con bytes nulos no es texto (es un binario con otra extensión).
    if (datos.subarray(0, 4096).includes(0)) throw new ErrorLectura("No parece un archivo de texto.");
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(datos);
    } catch {
      // Muchos archivos hechos en Windows vienen en Windows-1252 (las tildes se verían rotas como UTF-8).
      texto = new TextDecoder("windows-1252").decode(datos);
    }
  }
  return conTexto(nombre, limpiarTexto(texto), libre);
}

async function leerWord(archivo: File, nombre: string, libre: Libre): Promise<Lectura> {
  const datos = await archivo.arrayBuffer();
  const firma = new Uint8Array(datos.slice(0, 4));
  // Un .docx es un ZIP («PK»). Con la firma de los Office viejos es un .doc de Word 97-2003,
  // o un .docx con contraseña (Word los guarda cifrados con ese mismo formato).
  if (firma[0] === 0xd0 && firma[1] === 0xcf && firma[2] === 0x11 && firma[3] === 0xe0) {
    throw new ErrorLectura(
      nombre.toLowerCase().endsWith(".docx")
        ? "El Word tiene contraseña. Guardalo sin contraseña (o como PDF) y adjuntalo de nuevo."
        : "Los .doc (Word 97-2003) no se pueden leer: abrilo en Word y guardalo como .docx o PDF.",
    );
  }
  if (firma[0] !== 0x50 || firma[1] !== 0x4b) {
    throw new ErrorLectura("No se pudo leer este Word. Probá guardarlo como PDF y adjuntarlo de nuevo.");
  }
  const modulo = await import("mammoth");
  const mammoth = "default" in modulo ? modulo.default : modulo;
  let texto: string;
  try {
    texto = (await mammoth.extractRawText({ arrayBuffer: datos })).value;
  } catch {
    throw new ErrorLectura("No se pudo leer este Word. Probá guardarlo como PDF y adjuntarlo de nuevo.");
  }
  return conTexto(nombre, limpiarTexto(texto), libre);
}

/** Un archivo que es sólo texto: se recorta si no entra en lo que queda libre. */
function conTexto(nombre: string, texto: string, libre: Libre): Lectura {
  if (!texto.trim()) throw new ErrorLectura("El archivo no tiene texto.");
  if (libre.caracteres <= 0) throw new ErrorLectura(SIN_LUGAR, true);
  const recortado = texto.length > libre.caracteres;
  const usado = recortado ? texto.slice(0, libre.caracteres) : texto;
  return {
    adjunto: { nombre, texto: usado, imagenes: [] },
    detalle: `${palabras(usado)} palabras`,
    aviso: recortado ? "Es muy largo: se usó sólo la primera parte." : undefined,
    limitado: recortado,
  };
}

// ---------------------------------------------------------------- imágenes

async function leerImagen(archivo: File, nombre: string, libre: Libre): Promise<Lectura> {
  if (libre.imagenes <= 0) {
    throw new ErrorLectura(`Ya hay ${LIMITES_ADJUNTOS.imagenes} imágenes o páginas escaneadas adjuntas, el máximo.`, true);
  }
  let imagen: ImageBitmap;
  try {
    // Respeta la orientación de las fotos del celular (EXIF).
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new ErrorLectura(
      /hei[cf]$/i.test(nombre)
        ? "Este navegador no lee fotos HEIC del iPhone. Exportala como JPG y adjuntala de nuevo."
        : "No se pudo abrir esta imagen.",
    );
  }
  try {
    const datos = await aJpeg(imagen.width, imagen.height, (ctx, w, h) => ctx.drawImage(imagen, 0, 0, w, h));
    if (datos.length > libre.base64) throw new ErrorLectura(SIN_LUGAR, true);
    return { adjunto: { nombre, texto: "", imagenes: [{ datos }] }, detalle: "Imagen" };
  } finally {
    imagen.close();
  }
}

/**
 * Dibuja en un lienzo (con fondo blanco, por las imágenes con transparencia)
 * achicado a lo que la IA aprovecha, y lo pasa a JPEG en base64. Si queda
 * pesado, baja la calidad y, si hace falta, el tamaño.
 */
async function aJpeg(
  ancho: number,
  alto: number,
  dibujar: (ctx: CanvasRenderingContext2D, ancho: number, alto: number) => void | Promise<void>,
): Promise<string> {
  let escala = Math.min(1, LIMITES_ADJUNTOS.ladoImagen / Math.max(ancho, alto));
  for (let intento = 0; intento < 4; intento++) {
    const w = Math.max(1, Math.round(ancho * escala));
    const h = Math.max(1, Math.round(alto * escala));
    const lienzo = document.createElement("canvas");
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new ErrorLectura("El navegador no pudo procesar la imagen.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    await dibujar(ctx, w, h);
    for (const calidad of [0.82, 0.7, 0.58]) {
      const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", calidad));
      if (!blob) continue;
      const datos = await aBase64(blob);
      if (datos.length <= LIMITES_ADJUNTOS.base64PorImagen) {
        lienzo.width = lienzo.height = 0; // libera la memoria del lienzo
        return datos;
      }
    }
    lienzo.width = lienzo.height = 0;
    escala *= 0.75;
  }
  throw new ErrorLectura("La imagen es demasiado pesada incluso achicada.");
}

async function aBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

// ---------------------------------------------------------------- PDF

/*
 * pdf.js en su versión «legacy», que también anda en navegadores no
 * actualizados (la moderna usa funciones de JavaScript de 2026). El worker
 * tiene que ser de la misma versión.
 */
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfJsListo: Promise<PdfJs> | null = null;

function cargarPdfJs(): Promise<PdfJs> {
  pdfJsListo ??= import("pdfjs-dist/legacy/build/pdf.mjs")
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    })
    .catch((e) => {
      pdfJsListo = null; // que se pueda reintentar
      throw e;
    });
  return pdfJsListo;
}

async function leerPdf(archivo: File, nombre: string, libre: Libre): Promise<Lectura> {
  const pdfjs = await cargarPdfJs();
  // Los recursos que pdf.js carga aparte (los copia scripts/copiar-pdfjs.mjs): sin los
  // decodificadores, las páginas escaneadas en JBIG2 o CCITT se leerían en blanco.
  const recursos = `${location.origin}/pdfjs/${pdfjs.version}/`;
  const carga = pdfjs.getDocument({
    data: new Uint8Array(await archivo.arrayBuffer()),
    wasmUrl: `${recursos}wasm/`,
    cMapUrl: `${recursos}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${recursos}standard_fonts/`,
    iccUrl: `${recursos}iccs/`,
  });
  let documento: Awaited<typeof carga.promise>;
  try {
    documento = await carga.promise;
  } catch (e) {
    void carga.destroy();
    throw new ErrorLectura(
      e instanceof Error && e.name === "PasswordException"
        ? "El PDF tiene contraseña. Guardalo sin contraseña y adjuntalo de nuevo."
        : "No se pudo abrir este PDF.",
    );
  }

  try {
    const total = documento.numPages;
    const leidas = Math.min(total, LIMITES_ADJUNTOS.paginasPorArchivo);
    const avisos: string[] = [];
    if (total > leidas) avisos.push(`Se leyeron las primeras ${leidas} de ${total} páginas.`);

    // 1) El texto de cada página; las que casi no tienen texto son escaneadas.
    const textos: string[] = [];
    const escaneadas: number[] = [];
    let caracteres = 0;
    let sinLugarDesde = 0;
    for (let n = 1; n <= leidas; n++) {
      const pagina = await documento.getPage(n);
      const contenido = await pagina.getTextContent();
      const texto = limpiarTexto(
        contenido.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : "") : "")).join(""),
      );
      // Una página escaneada con un pie de texto (GDE, firma digital, «Página 1 de 3») tiene poco
      // texto y una imagen: va el texto y, además, la página como imagen.
      const legible = textoLegible(texto);
      const conImagen =
        legible && texto.replace(/\s/g, "").length < POCO_TEXTO_PAGINA && (await tieneImagenes(pdfjs, pagina));
      pagina.cleanup();
      // Sin texto, o con un texto que no se puede leer (fuentes mal codificadas): va como imagen.
      if (!legible) {
        escaneadas.push(n);
        continue;
      }
      if (conImagen) escaneadas.push(n);
      const bloque = `— Página ${n} —\n${texto}`;
      // Las páginas se unen con un renglón en blanco («\n\n»): también cuenta.
      if (caracteres + bloque.length + (textos.length ? 2 : 0) > libre.caracteres) {
        sinLugarDesde ||= n;
        continue;
      }
      caracteres += bloque.length + (textos.length ? 2 : 0);
      textos.push(bloque);
    }
    if (sinLugarDesde) avisos.push(`Por el máximo de texto, no se incluyó el texto desde la página ${sinLugarDesde}.`);

    // 2) Las páginas escaneadas, como imagen, mientras haya lugar.
    const imagenes: Adjunto["imagenes"] = [];
    const enBlanco: number[] = [];
    let base64 = 0;
    for (const n of escaneadas) {
      if (imagenes.length >= libre.imagenes) break;
      const pagina = await documento.getPage(n);
      const vista = pagina.getViewport({ scale: 1 });
      let vacia = false;
      const datos = await aJpeg(vista.width * 3, vista.height * 3, async (ctx, w) => {
        const escalada = pagina.getViewport({ scale: w / vista.width });
        await pagina.render({ canvas: ctx.canvas, viewport: escalada, background: "#ffffff" }).promise;
        vacia = paginaEnBlanco(ctx.canvas);
      });
      pagina.cleanup();
      if (vacia) {
        enBlanco.push(n);
        continue;
      }
      if (base64 + datos.length > libre.base64) break;
      imagenes.push({ pagina: n, datos });
      base64 += datos.length;
    }
    if (enBlanco.length) {
      avisos.push(
        enBlanco.length === 1
          ? `La página ${enBlanco[0]} está en blanco o no se pudo leer.`
          : `Las páginas ${enBlanco.join(", ")} están en blanco o no se pudieron leer.`,
      );
    }
    const fuera = escaneadas.length - imagenes.length - enBlanco.length;
    if (fuera > 0) {
      avisos.push(
        `${fuera === 1 ? "Una página escaneada no se incluyó" : `${fuera} páginas escaneadas no se incluyeron`} por el máximo de imágenes.`,
      );
    }

    const texto = textos.join("\n\n");
    if (!texto && !imagenes.length) {
      if (sinLugarDesde || fuera > 0) throw new ErrorLectura(SIN_LUGAR, true);
      throw new ErrorLectura("El PDF no tiene texto ni páginas que se puedan leer.");
    }

    const partes = [`${leidas} ${leidas === 1 ? "página" : "páginas"}`];
    if (texto) partes.push(`${palabras(texto)} palabras`);
    if (imagenes.length) {
      partes.push(`${imagenes.length} ${imagenes.length === 1 ? "escaneada leída" : "escaneadas leídas"} como imagen`);
    }
    return {
      adjunto: { nombre, texto, imagenes },
      detalle: partes.join(" · "),
      aviso: avisos.join(" ") || undefined,
      limitado: Boolean(sinLugarDesde) || fuera > 0,
    };
  } finally {
    void carga.destroy(); // libera el documento y el worker
  }
}

// ---------------------------------------------------------------- utilidades

/**
 * Si el texto de una página de PDF sirve: tiene que tener algo de texto y ser
 * mayormente letras y números (algunos PDF tienen fuentes mal codificadas y
 * su «texto» es basura; esas páginas van como imagen).
 */
function textoLegible(texto: string): boolean {
  const visibles = texto.replace(/\s/g, "");
  if (visibles.length < MINIMO_TEXTO_PAGINA) return false;
  const raros = (visibles.match(/[\uFFFD\uE000-\uF8FF]/g) ?? []).length;
  const letras = (visibles.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return raros / visibles.length <= 0.05 && letras / visibles.length >= 0.5;
}

/** Si la página dibuja alguna imagen (un escaneo, una foto). */
async function tieneImagenes(
  pdfjs: PdfJs,
  pagina: Awaited<ReturnType<Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>["getPage"]>>,
): Promise<boolean> {
  const { OPS } = pdfjs;
  const deImagen = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintImageMaskXObject,
  ]);
  try {
    const operaciones = await pagina.getOperatorList();
    return operaciones.fnArray.some((op) => deImagen.has(op));
  } catch {
    return false;
  }
}

/** Si una página dibujada quedó en blanco (o casi): se mira una muestra achicada. */
function paginaEnBlanco(lienzo: HTMLCanvasElement): boolean {
  const muestra = document.createElement("canvas");
  muestra.width = muestra.height = 64;
  const ctx = muestra.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(lienzo, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  let oscuros = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] < 3 * 235) oscuros++;
  }
  muestra.width = muestra.height = 0;
  return oscuros < 4; // menos de 4 de 4.096 puntos con algo de tinta
}

/** Saca espacios de más y renglones vacíos repetidos, que sólo suman costo. */
function limpiarTexto(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function palabras(texto: string): string {
  const n = texto.split(/\s+/).filter(Boolean).length;
  return n.toLocaleString("es-AR");
}
