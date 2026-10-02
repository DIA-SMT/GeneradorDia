import {
  BLANCO,
  conBlancos,
  fechaLarga,
  lineaCargoFirma,
  lineasDeDatos,
  lineasDestinatario,
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
 */

const FUENTE = "Times New Roman";
const TAM = 24; // medios puntos: 12 pt
const AZUL_PROFUNDO = "28469F";
const CELESTE = "3CB4F0";
const GRIS = "6B7885";

export async function descargarDocx(
  nota: NotaGenerada,
  enc: DatosEncabezado & { tipoNombre: string },
): Promise<void> {
  const d = await import("docx");
  const mm = d.convertMillimetersToTwip;

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
      despues?: number;
      negrita?: boolean;
      /** Tamaño en medios puntos (24 = 12 pt). */
      tam?: number;
      color?: string;
      /** Interlineado en 240avos de línea (360 = 1,5). */
      interlineado?: number;
    } = {},
  ) =>
    new d.Paragraph({
      alignment: opciones.alineacion ?? d.AlignmentType.JUSTIFIED,
      spacing: { after: opciones.despues ?? 200, line: opciones.interlineado ?? 360 },
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
      tam: 21,
      despues: 360,
    }),
  );

  // Destinatario en negrita: nombre (un poco más grande), área y «De la Municipalidad…».
  const destinatario = lineasDestinatario(enc);
  destinatario.forEach((l, i) =>
    cuerpo.push(
      parrafo(l, {
        alineacion: d.AlignmentType.LEFT,
        negrita: true,
        tam: i === 0 ? 26 : TAM,
        despues: i === destinatario.length - 1 ? 240 : 0,
        interlineado: 276,
      }),
    ),
  );

  // Número de nota y expediente (sólo si se cargaron), en cuerpo chico.
  const datos = lineasDeDatos(enc);
  datos.forEach((dato, i) =>
    cuerpo.push(
      new d.Paragraph({
        spacing: { after: i === datos.length - 1 ? 300 : 40 },
        children: [
          new d.TextRun({ text: `${dato.etiqueta}: `, font: FUENTE, size: 21 }),
          ...corridas(dato.texto, { tam: 21 }),
        ],
      }),
    ),
  );

  const numeros = numerarCuerpo(nota.cuerpo);
  for (const [i, b] of nota.cuerpo.entries()) {
    if (!b.texto.trim()) continue;
    if (b.tipo === "item") {
      const numero = numeros[i];
      cuerpo.push(
        new d.Paragraph({
          alignment: d.AlignmentType.JUSTIFIED,
          indent: { left: mm(20), hanging: mm(8) },
          spacing: { after: 120, line: 360 },
          children: [new d.TextRun({ text: `${numero}.\t`, font: FUENTE, size: TAM }), ...corridas(b.texto)],
          tabStops: [{ type: d.TabStopType.LEFT, position: mm(20) }],
        }),
      );
      continue;
    }
    if (b.tipo === "titulo") {
      cuerpo.push(parrafo(b.texto, { alineacion: d.AlignmentType.LEFT, negrita: true, despues: 120 }));
    } else {
      cuerpo.push(parrafo(b.texto));
    }
  }

  if (nota.cierre) cuerpo.push(parrafo(nota.cierre));

  // Firma a la izquierda: línea, nombre y «Cargo - Área» en cuerpo chico.
  const izquierda = { alineacion: d.AlignmentType.LEFT, despues: 0, interlineado: 276 } as const;
  cuerpo.push(new d.Paragraph({ spacing: { before: 1200 }, children: [] }));
  cuerpo.push(parrafo("____________________________", izquierda));
  if (enc.remitenteNombre) cuerpo.push(parrafo(enc.remitenteNombre, { ...izquierda, tam: 22 }));
  const cargoFirma = lineaCargoFirma(enc.remitenteCargo, enc.remitenteArea);
  if (cargoFirma) cuerpo.push(parrafo(cargoFirma, { ...izquierda, tam: 19, color: "333333" }));

  const documento = new d.Document({
    creator: "Generador de Notas · Dirección de IA · Municipalidad de San Miguel de Tucumán",
    title: `${enc.tipoNombre}: ${conBlancos(nota.referencia)}`,
    sections: [
      {
        properties: {
          page: {
            size: { width: mm(210), height: mm(297) },
            margin: { top: mm(38), right: mm(20), bottom: mm(22), left: mm(28), header: mm(12) },
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

export function nombreArchivo(enc: DatosEncabezado & { tipoNombre: string }, extension: string): string {
  const partes = [
    "Nota",
    enc.tipoNombre,
    enc.numeroNota.trim() || enc.expediente.trim(),
    enc.fecha,
  ].filter(Boolean);
  const base = partes
    .join("_")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w.-]+/g, "_");
  return `${base}.${extension}`;
}
