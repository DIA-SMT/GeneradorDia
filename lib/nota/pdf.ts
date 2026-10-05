import type { Content, TDocumentDefinitions, TFontContainer } from "pdfmake/interfaces";
import {
  conBlancos,
  fechaLarga,
  lineaCargoFirma,
  lineasDeDatos,
  lineasDestinatario,
  nombreArchivo,
  numerarCuerpo,
  type DatosEncabezado,
} from "./formato";
import type { NotaGenerada } from "./tipos";

/**
 * La nota en PDF, armada en el navegador con la misma estructura y medidas
 * que la hoja (HojaNota.tsx): membrete, fecha, destinatario, cuerpo, cierre
 * y firma, en A4 con márgenes de 28/20 mm a los costados y 18/22 mm arriba y
 * abajo.
 *
 * Para imprimir se usa este PDF y no la página: a un PDF el navegador nunca
 * le agrega su encabezado y su pie (fecha y hora, título, dirección y número
 * de hoja), que no se pueden apagar desde la página.
 *
 * La nota tiene que entrar en una hoja: si no entra, se achican de a poco
 * los espacios, el interlineado y, al final, apenas la letra (hasta 10,5 pt).
 * Si ni así entra (un informe largo), sale en tamaño normal en varias hojas,
 * con el cierre y la firma siempre juntos.
 *
 * La librería (pdfmake) se carga recién al usarla.
 */

type Encabezado = DatosEncabezado & { tipoNombre: string };

const MM = 72 / 25.4; // puntos por milímetro
const ANCHO_UTIL = (210 - 28 - 20) * MM;

const AZUL_PROFUNDO = "#28469f";
const CELESTE = "#3cb4f0";
const AMARILLO = "#f2d91c";
const GRIS = "#6b7885";

/**
 * pdfmake mide el interlineado en múltiplos del alto de la letra (ascendente
 * + descendente), que en Times y en Helvetica es menor que su tamaño. Esto
 * pasa un interlineado de CSS («1.5» = 1,5 veces el tamaño) al de pdfmake.
 */
const enTimes = (css: number) => css / 0.9;
const enHelvetica = (css: number) => css / 0.925;

/**
 * Cuánto se achica la nota para que entre en una hoja; el primero es el tamaño
 * normal. «letra», «espacio» y «margen» multiplican el tamaño de la letra, los
 * espacios entre bloques y los márgenes de arriba y abajo; «interlineado» es
 * como el de CSS (1,5 = una vez y media el tamaño de la letra). El Word usa
 * las mismas medidas (ver docx.ts).
 */
const NIVELES = [
  { letra: 1, espacio: 1, interlineado: 1.5, margen: 1 },
  { letra: 1, espacio: 0.75, interlineado: 1.42, margen: 1 },
  { letra: 0.97, espacio: 0.6, interlineado: 1.36, margen: 0.9 },
  { letra: 0.93, espacio: 0.5, interlineado: 1.3, margen: 0.8 },
  { letra: 0.875, espacio: 0.4, interlineado: 1.25, margen: 0.7 },
] as const;
export type Medidas = (typeof NIVELES)[number];
export const MEDIDAS_NORMALES: Medidas = NIVELES[0];

/** El último párrafo acompaña al cierre y la firma si es corto (si es largo, dejaría un hueco grande). */
const ULTIMO_PARRAFO_CON_LA_FIRMA = 700;

type Logos = { muni: string | null; dia: string | null };

/** Arma el PDF de la nota y devuelve el archivo y cuántas hojas ocupa. */
export async function armarPdf(nota: NotaGenerada, enc: Encabezado): Promise<{ blob: Blob; hojas: number }> {
  const { blob, hojas } = await ajustarAUnaHoja(nota, enc, 0);
  return { blob, hojas };
}

/**
 * Las medidas con que la nota entra en una hoja, para el Word. `holguraMm`
 * reserva ese espacio de más al pie al medir, porque Word puede cortar los
 * renglones un poco distinto que el PDF.
 */
export async function medidasParaUnaHoja(nota: NotaGenerada, enc: Encabezado, holguraMm: number): Promise<Medidas> {
  const conReserva = await ajustarAUnaHoja(nota, enc, holguraMm);
  if (conReserva.hojas <= 1) return conReserva.medidas;
  // Con la reserva no entra ni con lo más apretado; si sin la reserva entra (como el PDF), va lo más
  // apretado posible, que es lo que más chances tiene de entrar en una hoja. Si no, tamaño normal.
  const sinReserva = await ajustarAUnaHoja(nota, enc, 0);
  return sinReserva.hojas <= 1 ? NIVELES[NIVELES.length - 1] : MEDIDAS_NORMALES;
}

async function ajustarAUnaHoja(nota: NotaGenerada, enc: Encabezado, holguraMm: number) {
  const [pdfMake, logos] = await Promise.all([cargarPdfMake(), cargarLogos()]);

  const probar = async (medidas: Medidas) => {
    let hojas = 0;
    const definida = definicion(nota, enc, medidas, logos, holguraMm, (n) => (hojas = n));
    const blob = await pdfMake.createPdf(definida).getBlob();
    return { medidas, blob, hojas };
  };

  const normal = await probar(NIVELES[0]);
  if (normal.hojas <= 1) return normal;
  // Si ni achicando al máximo entra en una hoja, va en tamaño normal en varias.
  const minimo = await probar(NIVELES[NIVELES.length - 1]);
  if (minimo.hojas > 1) return normal;
  for (const nivel of NIVELES.slice(1, -1)) {
    const intento = await probar(nivel);
    if (intento.hojas <= 1) return intento;
  }
  return minimo;
}

export async function descargarPdf(nota: NotaGenerada, enc: Encabezado): Promise<void> {
  const { blob } = await armarPdf(nota, enc);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombreArchivo(enc, "pdf");
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
}

/** El marco con el último PDF mandado a imprimir (se reemplaza en la impresión siguiente). */
let marco: HTMLIFrameElement | null = null;

/**
 * Abre el diálogo de impresión con el PDF de la nota. El PDF se carga en un
 * marco invisible y se imprime desde ahí; si el navegador no lo permite, se
 * abre en una pestaña nueva para imprimirlo desde el visor.
 */
export async function imprimirPdf(nota: NotaGenerada, enc: Encabezado): Promise<void> {
  const { blob } = await armarPdf(nota, enc);
  const url = URL.createObjectURL(blob);
  if (marco) {
    URL.revokeObjectURL(marco.src);
    marco.remove();
  }
  const nuevo = document.createElement("iframe");
  marco = nuevo;
  nuevo.title = "Nota para imprimir";
  nuevo.setAttribute("aria-hidden", "true");
  nuevo.tabIndex = -1;
  nuevo.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  nuevo.onload = () => {
    try {
      nuevo.contentWindow?.focus();
      nuevo.contentWindow?.print();
    } catch {
      window.open(url, "_blank");
    }
  };
  nuevo.src = url;
  document.body.appendChild(nuevo);
}

function definicion(
  nota: NotaGenerada,
  enc: Encabezado,
  n: Medidas,
  logos: Logos,
  holguraMm: number,
  alContarHojas: (hojas: number) => void,
): TDocumentDefinitions {
  const pt = (tam: number) => tam * n.letra;
  const espacio = (mm: number) => mm * n.espacio * MM;
  const ajustado = Math.min(1.375, n.interlineado); // líneas apretadas: destinatario y firma
  // Un dato que no se completó sale como línea en blanco, igual que en el Word y al copiar.
  const texto = (t: string) => paraPdf(conBlancos(t));

  // Membrete: isologo, nombre de la Municipalidad y área que firma, logo de la Dirección de IA y la línea de color.
  const conArea = Boolean(enc.remitenteArea.trim());
  const membrete: Content = {
    stack: [
      {
        columns: [
          logos.muni
            ? { image: logos.muni, width: 15 * MM, height: 15 * MM }
            : { text: "", width: 15 * MM },
          {
            width: "*",
            // Centrado a ojo respecto del isologo (15 mm de alto).
            margin: [0, (conArea ? 3 : 5.2) * MM, 0, 0],
            stack: [
              {
                text: "MUNICIPALIDAD DE SAN MIGUEL DE TUCUMÁN",
                font: "Helvetica",
                bold: true,
                fontSize: 10.5,
                color: AZUL_PROFUNDO,
                characterSpacing: 0.26,
                lineHeight: enHelvetica(1.25),
              },
              ...(conArea
                ? [
                    {
                      text: paraPdf(enc.remitenteArea.trim()),
                      font: "Helvetica",
                      fontSize: 9,
                      color: GRIS,
                      lineHeight: enHelvetica(1.25),
                      margin: [0, 0.5 * MM, 0, 0] as [number, number, number, number],
                    },
                  ]
                : []),
            ],
          },
          logos.dia
            ? { image: logos.dia, width: (12 * MM * 526) / 220, height: 12 * MM, margin: [0, 1.5 * MM, 0, 0] }
            : { text: "", width: 0 },
        ],
        columnGap: 4 * MM,
      },
      {
        canvas: [
          { type: "rect", x: 0, y: 0, w: ANCHO_UTIL * 0.22, h: 1.2 * MM, color: AMARILLO },
          { type: "rect", x: ANCHO_UTIL * 0.22, y: 0, w: ANCHO_UTIL * 0.78, h: 1.2 * MM, color: CELESTE },
        ],
        margin: [0, 3 * MM, 0, 0],
      },
    ],
  };

  const fecha: Content = {
    text: `San Miguel de Tucumán, ${fechaLarga(enc.fecha)}.`,
    alignment: "right",
    bold: true,
    fontSize: pt(10.5),
    margin: [0, espacio(9), 0, 0],
  };

  const destinatario: Content = {
    stack: lineasDestinatario(enc).map((l, i) => ({
      text: texto(l),
      bold: true,
      fontSize: pt(i === 0 ? 13 : 12),
      lineHeight: enTimes(ajustado),
    })),
    margin: [0, espacio(8), 0, 0],
  };

  const lineasDatos = lineasDeDatos(enc);
  const datos: Content[] = lineasDatos.length
    ? [
        {
          stack: lineasDatos.map((d, i) => ({
            text: texto(`${d.etiqueta}: ${d.texto}`),
            fontSize: pt(10.5),
            lineHeight: enTimes(ajustado),
            margin: [0, 0, 0, i < lineasDatos.length - 1 ? espacio(1) : 0] as [number, number, number, number],
          })),
          margin: [0, espacio(5), 0, 0],
        },
      ]
    : [];

  // Cuerpo, con la misma numeración de los puntos que la hoja y el Word.
  const numeros = numerarCuerpo(nota.cuerpo);
  const bloques: { contenido: Content; esParrafoCorto: boolean }[] = [];
  nota.cuerpo.forEach((b, i) => {
    if (!b.texto.trim()) return;
    const separacion: [number, number, number, number] = [0, 0, 0, espacio(4)];
    if (b.tipo === "titulo") {
      bloques.push({
        contenido: {
          text: texto(b.texto),
          bold: true,
          alignment: "left",
          headlineLevel: 1, // no queda solo al pie de una hoja (ver pageBreakBefore)
          margin: [0, espacio(2), 0, espacio(4)],
        },
        esParrafoCorto: false,
      });
    } else if (b.tipo === "item") {
      bloques.push({
        contenido: {
          columns: [
            { text: `${numeros[i]}.`, width: 5 * MM, alignment: "right" },
            { text: texto(b.texto), width: "*", alignment: "justify" },
          ],
          columnGap: 3 * MM,
          margin: [12 * MM, 0, 0, espacio(4)],
        },
        esParrafoCorto: b.texto.length <= ULTIMO_PARRAFO_CON_LA_FIRMA,
      });
    } else {
      bloques.push({
        contenido: { text: texto(b.texto), alignment: "justify", margin: separacion },
        esParrafoCorto: b.texto.length <= ULTIMO_PARRAFO_CON_LA_FIRMA,
      });
    }
  });

  // Cierre y firma, siempre juntos: si no entran en la hoja, pasan a la siguiente
  // con el último párrafo (si es corto), así la firma nunca queda sola.
  const cargoFirma = lineaCargoFirma(enc.remitenteCargo, enc.remitenteArea);
  const firma: Content = {
    stack: [
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 60 * MM, y2: 0, lineWidth: 0.75 }], margin: [0, 0, 0, 2 * MM] },
      ...(enc.remitenteNombre.trim()
        ? [{ text: paraPdf(enc.remitenteNombre.trim()), fontSize: pt(11), lineHeight: enTimes(ajustado) }]
        : []),
      ...(cargoFirma
        ? [{ text: paraPdf(cargoFirma), fontSize: pt(9.5), color: "#333333", lineHeight: enTimes(ajustado) }]
        : []),
    ],
    // El espacio para firmar a mano no baja de 15 mm.
    margin: [0, Math.max(15 * MM, espacio(22)), 0, 0],
  };
  const ultimo = bloques.at(-1);
  const acompana = ultimo?.esParrafoCorto ? [bloques.pop()!.contenido] : [];
  const cierreYFirma: Content = {
    stack: [
      ...acompana,
      ...(nota.cierre.trim() ? [{ text: texto(nota.cierre), alignment: "justify" as const }] : []),
      firma,
    ],
    unbreakable: true,
  };

  return {
    pageSize: "A4",
    pageMargins: [28 * MM, 18 * MM * n.margen, 20 * MM, (22 * n.margen + holguraMm) * MM],
    info: {
      title: nombreArchivo(enc, "pdf").replace(/\.pdf$/, ""),
      author: "Municipalidad de San Miguel de Tucumán",
      creator: "Generador de Notas · Dirección de Inteligencia Artificial",
    },
    defaultStyle: { font: "Times", fontSize: pt(12), lineHeight: enTimes(n.interlineado), color: "#111111" },
    content: [
      membrete,
      fecha,
      destinatario,
      ...datos,
      { stack: [...bloques.map((b) => b.contenido), cierreYFirma], margin: [0, espacio(7), 0, 0] },
    ],
    pageBreakBefore: (nodo, consultas) => nodo.headlineLevel === 1 && consultas.getFollowingNodesOnPage().length === 0,
    // Sin pie: sólo sirve para saber cuántas hojas ocupó.
    footer: (_hoja, total) => {
      alContarHojas(total);
      return "";
    },
  };
}

type PdfMake = typeof import("pdfmake/build/pdfmake");
let pdfMakeListo: Promise<PdfMake> | null = null;

/** pdfmake con las fuentes estándar del PDF (Times y Helvetica): no hay que embeber ningún archivo. */
function cargarPdfMake(): Promise<PdfMake> {
  pdfMakeListo ??= (async () => {
    const [modulo, times, helvetica] = await Promise.all([
      import("pdfmake/build/pdfmake"),
      import("pdfmake/build/standard-fonts/Times"),
      import("pdfmake/build/standard-fonts/Helvetica"),
    ]);
    const pdfMake = ("default" in modulo ? modulo.default : modulo) as PdfMake;
    pdfMake.addFontContainer(contenedor(times));
    pdfMake.addFontContainer(contenedor(helvetica));
    return pdfMake;
  })().catch((e) => {
    pdfMakeListo = null; // que se pueda reintentar
    throw e;
  });
  return pdfMakeListo;
}

function contenedor(modulo: TFontContainer | { default: TFontContainer }): TFontContainer {
  return "default" in modulo ? modulo.default : modulo;
}

async function cargarLogos(): Promise<Logos> {
  const [muni, dia] = await Promise.all([comoDataUrl("/logo-muni-iso.png"), comoDataUrl("/logo-ia.png")]);
  return { muni, dia };
}

async function comoDataUrl(ruta: string): Promise<string | null> {
  try {
    const r = await fetch(ruta);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((resolver, fallar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result));
      lector.onerror = () => fallar(lector.error);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Las fuentes estándar del PDF sólo tienen los caracteres de Windows-1252
 * (alcanza para el castellano). El resto se reemplaza por su equivalente
 * más cercano, para que no salga un hueco.
 */
const WIN_1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const EQUIVALENTES: Record<string, string> = {
  "‐": "-", // guion
  "‑": "-", // guion que no corta
  "‒": "–",
  "―": "—",
  "−": "-", // signo menos
  "′": "'",
  "″": '"',
  "→": "->",
  "←": "<-",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "≈": "~",
  "­": "", // guion blando
  "​": "", // espacio de ancho cero
  "‌": "",
  "‍": "",
  "﻿": "",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
};

function paraPdf(t: string): string {
  let salida = "";
  for (const c of t.normalize("NFC")) {
    const codigo = c.codePointAt(0)!;
    if ((codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa0 && codigo <= 0xff) || c === "\n" || WIN_1252_EXTRA.includes(c)) {
      salida += c;
    } else if (c in EQUIVALENTES) {
      salida += EQUIVALENTES[c];
    } else if (c === "\t") {
      salida += " ";
    } else {
      // Una letra con un acento que no está (ő, ł…) sale sin el acento; lo demás, como «?».
      const base = c.normalize("NFD").replace(/\p{M}/gu, "");
      salida += base && base !== c && [...base].every((x) => x.codePointAt(0)! < 0x100) ? base : "?";
    }
  }
  return salida;
}
