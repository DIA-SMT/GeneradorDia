import {
  BLANCO,
  conBlancos,
  fechaLarga,
  lineaCargoFirma,
  lineasDeDatos,
  lineasDestinatario,
  nombreArchivo,
  numerarCuerpo,
  partirMarcadores,
  type DatosEncabezado,
} from "./formato";
import type { NotaGenerada } from "./tipos";

/**
 * Exporta la nota a Word (.docx) con el membrete municipal en el encabezado
 * de página y la misma estructura que la vista previa (ver HojaNota.tsx).
 * La librería se carga recién al exportar, para no sumar peso a la carga
 * inicial.
 *
 * Igual que el PDF, la nota tiene que entrar en una hoja: el Word usa las
 * mismas medidas que el PDF (letra, interlineado y espacios), elegidas con el
 * mismo cálculo (ver pdf.ts) y con una reserva al pie, porque Word puede
 * cortar los renglones un poco distinto.
 */

const FUENTE = "Times New Roman";
/** Reserva al pie al medir si la nota entra en una hoja (ver arriba). */
const HOLGURA_MM = 12;
const AZUL_PROFUNDO = "28469F";
const CELESTE = "3CB4F0";
const GRIS = "6B7885";

export async function descargarDocx(
  nota: NotaGenerada,
  enc: DatosEncabezado & { tipoNombre: string },
): Promise<void> {
  const [d, { medidasParaUnaHoja, MEDIDAS_NORMALES }] = await Promise.all([import("docx"), import("./pdf")]);
  const mm = d.convertMillimetersToTwip;

  // Si no se pueden calcular (no cargó la librería del PDF), el Word sale en tamaño normal.
  const m = await medidasParaUnaHoja(nota, enc, HOLGURA_MM).catch(() => MEDIDAS_NORMALES);
  /** Tamaño de letra en medios puntos (24 = 12 pt), achicado como el PDF y redondeado hacia abajo. */
  const tam = (pt: number) => Math.floor(pt * m.letra * 2);
  /**
   * Interlineado «al menos» en vigésimos de punto, para un tamaño de letra en medios puntos. Va en
   * puntos (y no en «1,5 líneas», que en Word depende de la fuente) para que el alto sea el mismo
   * que en el PDF: 1,5 con letra de 12 pt son 18 pt.
   */
  const renglon = (css: number, medios: number) => ({
    line: Math.round(css * (medios / 2) * 20),
    lineRule: d.LineRuleType.AT_LEAST,
  });
  /** Un espacio entre bloques de la hoja (en mm a tamaño normal), achicado como el PDF. */
  const espacio = (milimetros: number) => Math.round(mm(milimetros * m.espacio));
  const TAM = tam(12);
  const INTERLINEADO = m.interlineado;
  const AJUSTADO = Math.min(1.375, m.interlineado); // destinatario, datos y firma

  // Un dato que no se completó sale como línea en blanco (para completar a mano), nunca resaltado.
  const corridas = (texto: string, extra: { bold?: boolean; tam?: number; color?: string } = {}) =>
    partirMarcadores(texto).map(
      (p) =>
        new d.TextRun({
          text: p.marcador ? BLANCO : p.texto,
          font: FUENTE,
          size: extra.tam ?? TAM,
          bold: extra.bold,
          color: extra.color,
        }),
    );

  const parrafo = (
    texto: string,
    opciones: {
      alineacion?: (typeof d.AlignmentType)[keyof typeof d.AlignmentType];
      antes?: number;
      despues?: number;
      negrita?: boolean;
      /** Tamaño en medios puntos (24 = 12 pt). */
      tam?: number;
      color?: string;
      /** Interlineado como el de CSS (1,5 = vez y media el tamaño de la letra). */
      interlineado?: number;
      /** Que no quede separado del párrafo siguiente por un salto de página. */
      conElSiguiente?: boolean;
      /** Que el párrafo no se parta entre dos páginas. */
      sinPartir?: boolean;
    } = {},
  ) =>
    new d.Paragraph({
      alignment: opciones.alineacion ?? d.AlignmentType.JUSTIFIED,
      spacing: {
        before: opciones.antes,
        after: opciones.despues ?? espacio(4),
        ...renglon(opciones.interlineado ?? INTERLINEADO, opciones.tam ?? TAM),
      },
      keepNext: opciones.conElSiguiente,
      keepLines: opciones.sinPartir,
      children: corridas(texto, { bold: opciones.negrita, tam: opciones.tam, color: opciones.color }),
    });

  // Membrete: isologo + nombre de la Municipalidad + área que firma.
  let logo: ArrayBuffer | null = null;
  try {
    logo = await (await fetch("/logo-muni-iso.png")).arrayBuffer();
  } catch {
    logo = null;
  }
  // Logo de la Dirección de IA (526 × 220 px): va en todas las notas, firme quien firme.
  let logoDIA: ArrayBuffer | null = null;
  try {
    logoDIA = await (await fetch("/logo-ia.png")).arrayBuffer();
  } catch {
    logoDIA = null;
  }

  const sinBordes = {
    top: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const membrete = new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE },
    borders: { ...sinBordes, insideHorizontal: sinBordes.top, insideVertical: sinBordes.top },
    rows: [
      new d.TableRow({
        children: [
          new d.TableCell({
            width: { size: mm(18), type: d.WidthType.DXA },
            borders: sinBordes,
            verticalAlign: d.VerticalAlign.CENTER,
            children: [
              new d.Paragraph({
                children: logo
                  ? [new d.ImageRun({ type: "png", data: logo, transformation: { width: 52, height: 52 } })]
                  : [],
              }),
            ],
          }),
          new d.TableCell({
            borders: sinBordes,
            verticalAlign: d.VerticalAlign.CENTER,
            children: [
              new d.Paragraph({
                children: [
                  new d.TextRun({
                    text: "MUNICIPALIDAD DE SAN MIGUEL DE TUCUMÁN",
                    font: "Arial",
                    size: 20,
                    bold: true,
                    color: AZUL_PROFUNDO,
                  }),
                ],
              }),
              ...(enc.remitenteArea
                ? [
                    new d.Paragraph({
                      children: [new d.TextRun({ text: enc.remitenteArea, font: "Arial", size: 17, color: GRIS })],
                    }),
                  ]
                : []),
            ],
          }),
          ...(logoDIA
            ? [
                new d.TableCell({
                  width: { size: mm(34), type: d.WidthType.DXA },
                  borders: sinBordes,
                  verticalAlign: d.VerticalAlign.CENTER,
                  children: [
                    new d.Paragraph({
                      alignment: d.AlignmentType.RIGHT,
                      children: [new d.ImageRun({ type: "png", data: logoDIA, transformation: { width: 108, height: 45 } })],
                    }),
                  ],
                }),
              ]
            : []),
        ],
      }),
    ],
  });

  const lineaMembrete = new d.Paragraph({
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 12, color: CELESTE, space: 1 } },
    spacing: { after: 0 },
    children: [],
  });

  const cuerpo: InstanceType<typeof d.Paragraph>[] = [];

  // Lugar y fecha: arriba a la derecha, en negrita y cuerpo chico.
  cuerpo.push(
    parrafo(`San Miguel de Tucumán, ${fechaLarga(enc.fecha)}.`, {
      alineacion: d.AlignmentType.RIGHT,
      negrita: true,
      tam: tam(10.5),
      despues: espacio(8),
      interlineado: AJUSTADO,
    }),
  );

  // Destinatario en negrita: nombre (un poco más grande), área y «De la Municipalidad…».
  const destinatario = lineasDestinatario(enc);
  const datos = lineasDeDatos(enc);
  destinatario.forEach((l, i) =>
    cuerpo.push(
      parrafo(l, {
        alineacion: d.AlignmentType.LEFT,
        negrita: true,
        tam: i === 0 ? tam(13) : TAM,
        despues: i === destinatario.length - 1 ? espacio(datos.length ? 5 : 7) : 0,
        interlineado: AJUSTADO,
      }),
    ),
  );

  // Número de nota y expediente (sólo si se cargaron), en cuerpo chico.
  datos.forEach((dato, i) =>
    cuerpo.push(
      new d.Paragraph({
        spacing: { after: i === datos.length - 1 ? espacio(7) : espacio(1), ...renglon(AJUSTADO, tam(10.5)) },
        children: [
          new d.TextRun({ text: `${dato.etiqueta}: `, font: FUENTE, size: tam(10.5) }),
          ...corridas(dato.texto, { tam: tam(10.5) }),
        ],
      }),
    ),
  );

  const numeros = numerarCuerpo(nota.cuerpo);
  // El último bloque del cuerpo acompaña al cierre y la firma: si no entran en la página,
  // pasan a la siguiente con sus últimas líneas y la firma nunca queda sola.
  const ultimo = nota.cuerpo.findLastIndex((b) => b.texto.trim());
  for (const [i, b] of nota.cuerpo.entries()) {
    if (!b.texto.trim()) continue;
    if (b.tipo === "item") {
      const numero = numeros[i];
      cuerpo.push(
        new d.Paragraph({
          alignment: d.AlignmentType.JUSTIFIED,
          indent: { left: mm(20), hanging: mm(8) },
          spacing: { after: espacio(4), ...renglon(INTERLINEADO, TAM) },
          keepNext: i === ultimo,
          children: [new d.TextRun({ text: `${numero}.\t`, font: FUENTE, size: TAM }), ...corridas(b.texto)],
          tabStops: [{ type: d.TabStopType.LEFT, position: mm(20) }],
        }),
      );
      continue;
    }
    if (b.tipo === "titulo") {
      cuerpo.push(
        parrafo(b.texto, { alineacion: d.AlignmentType.LEFT, negrita: true, antes: espacio(2), conElSiguiente: true }),
      );
    } else {
      cuerpo.push(parrafo(b.texto, { conElSiguiente: i === ultimo }));
    }
  }

  // El cierre y la firma van siempre juntos, en la misma página (keepNext encadena cada
  // párrafo con el siguiente hasta la última línea de la firma).
  if (nota.cierre) cuerpo.push(parrafo(nota.cierre, { despues: 0, conElSiguiente: true, sinPartir: true }));

  // Firma a la izquierda: línea, nombre y «Cargo - Área» en cuerpo chico. La línea es un renglón de
  // 1 pt con un borde de 60 mm (como la raya de la hoja y del PDF); arriba queda el espacio para
  // firmar a mano, que no baja de 15 mm.
  cuerpo.push(
    new d.Paragraph({
      spacing: {
        before: Math.round(mm(Math.max(15, 22 * m.espacio))),
        after: Math.round(mm(2)),
        line: 20,
        lineRule: d.LineRuleType.EXACT,
      },
      indent: { right: mm(210 - 28 - 20 - 60) },
      border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: "000000", space: 0 } },
      keepNext: true,
      children: [],
    }),
  );
  const izquierda = { alineacion: d.AlignmentType.LEFT, despues: 0, interlineado: AJUSTADO } as const;
  const cargoFirma = lineaCargoFirma(enc.remitenteCargo, enc.remitenteArea);
  const lineasFirma = [
    { texto: enc.remitenteNombre, estilo: { tam: tam(11) } },
    { texto: cargoFirma, estilo: { tam: tam(9.5), color: "333333" } },
  ].filter((l) => l.texto);
  lineasFirma.forEach((l, i) =>
    cuerpo.push(parrafo(l.texto, { ...izquierda, ...l.estilo, conElSiguiente: i < lineasFirma.length - 1 })),
  );

  const documento = new d.Document({
    creator: "Generador de Notas · Dirección de IA · Municipalidad de San Miguel de Tucumán",
    title: `${enc.tipoNombre}: ${conBlancos(nota.referencia)}`,
    sections: [
      {
        properties: {
          page: {
            size: { width: mm(210), height: mm(297) },
            // Arriba, el membrete (encabezado de página) y el mismo espacio hasta la fecha que en la hoja.
            margin: {
              // Nunca menos de 34 mm: más arriba se encimaría con el membrete.
              top: Math.round(mm(Math.max(34, 29 + 9 * m.espacio))),
              right: mm(20),
              bottom: Math.round(mm(22 * m.margen)),
              left: mm(28),
              header: mm(12),
            },
          },
        },
        headers: { default: new d.Header({ children: [membrete, lineaMembrete] }) },
        children: cuerpo,
      },
    ],
  });

  const blob = await d.Packer.toBlob(documento);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombreArchivo(enc, "docx");
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
}
