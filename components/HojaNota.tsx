"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import {
  fechaLarga,
  lineaCargoFirma,
  lineasDeDatos,
  lineasDestinatario,
  numerarCuerpo,
  partirMarcadores,
  type DatosEncabezado,
} from "@/lib/nota/formato";
import type { BloqueCuerpo, NotaGenerada } from "@/lib/nota/tipos";

type Props = {
  nota: NotaGenerada;
  enc: DatosEncabezado;
  editando: boolean;
  alCambiar: (nota: NotaGenerada) => void;
};

/**
 * La nota tal como se imprime, con la estructura de las notas de la
 * Municipalidad: fecha arriba a la derecha; destinatario en negrita (nombre,
 * área y «De la Municipalidad de San Miguel de Tucumán»); expediente y
 * referencia; cuerpo que abre con «En mi carácter de…»; cierre «Sin otro
 * particular…»; firma a la izquierda con «Cargo - Área».
 *
 * El destinatario, el número, el expediente y la firma salen del formulario
 * (se corrigen con «Cambiar datos»); la referencia, el cuerpo y el cierre
 * los escribe la IA y se pueden editar acá.
 */
export function HojaNota({ nota, enc, editando, alCambiar }: Props) {
  const destinatario = lineasDestinatario(enc);
  const datos = lineasDeDatos(nota, enc);
  const cargoFirma = lineaCargoFirma(enc.remitenteCargo, enc.remitenteArea);

  const cambiarBloque = (i: number, texto: string) => {
    const cuerpo = nota.cuerpo.map((b, j) => (j === i ? { ...b, texto } : b));
    alCambiar({ ...nota, cuerpo });
  };

  // Misma numeración que el Word y el texto copiado (ver numerarCuerpo).
  const numeros = numerarCuerpo(nota.cuerpo);

  return (
    <article className="hoja mx-auto shadow-[0_1px_3px_rgba(16,35,61,.08),0_12px_32px_rgba(16,35,61,.10)]">
      {/* Membrete */}
      <header className="membrete mb-[9mm]">
        <div className="flex items-center gap-[4mm]">
          <Image src="/logo-muni-iso.png" alt="" width={235} height={235} className="h-[15mm] w-[15mm]" />
          <div className="font-sans leading-tight">
            <p className="text-[10.5pt] font-extrabold tracking-wide text-smt-profundo">
              MUNICIPALIDAD DE SAN MIGUEL DE TUCUMÁN
            </p>
            {enc.remitenteArea && <p className="mt-0.5 text-[9pt] text-gris">{enc.remitenteArea}</p>}
          </div>
        </div>
        <div className="linea-smt mt-[3mm] h-[1.2mm]" />
      </header>

      {/* Lugar y fecha */}
      <p className="text-right text-[10.5pt] font-bold">San Miguel de Tucumán, {fechaLarga(enc.fecha)}.</p>

      {/* Destinatario */}
      <div
        className="mt-[8mm] font-bold leading-snug"
        title={editando ? "El destinatario se cambia desde el formulario (Cambiar datos)" : undefined}
      >
        {destinatario.map((l, i) => (
          <p key={i} className={i === 0 ? "text-[13pt]" : undefined}>
            <ConMarcadores texto={l} />
          </p>
        ))}
      </div>

      {/* Número, expediente y referencia */}
      <div className="mt-[5mm] space-y-[1mm] text-[10.5pt] leading-snug">
        {datos
          .filter((d) => d.etiqueta !== "Referencia")
          .map((d) => (
            <p key={d.etiqueta}>
              {d.etiqueta}: {d.texto}
            </p>
          ))}
        {(nota.referencia.trim() || editando) && (
          <div className="flex">
            <span className="mr-1 shrink-0">Referencia:</span>
            {editando ? (
              <AreaEdicion valor={nota.referencia} alCambiar={(v) => alCambiar({ ...nota, referencia: v })} etiqueta="Referencia" />
            ) : (
              <span>
                <ConMarcadores texto={nota.referencia} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Cuerpo */}
      <div className="mt-[7mm] space-y-[4mm] text-justify">
        {nota.cuerpo.map((b, i) => {
          if (!b.texto.trim() && !editando) return null;
          return (
            <BloqueDeCuerpo
              key={i}
              bloque={b}
              numero={numeros[i]}
              editando={editando}
              alCambiar={(v) => cambiarBloque(i, v)}
            />
          );
        })}

        {(nota.cierre || editando) && (
          <Bloque
            editando={editando}
            texto={nota.cierre}
            alCambiar={(v) => alCambiar({ ...nota, cierre: v })}
            etiqueta="Cierre"
          />
        )}
      </div>

      {/* Firma, a la izquierda: línea, nombre y «Cargo - Área» */}
      <div className="mt-[22mm] leading-snug">
        <div className="mb-[2mm] w-[60mm] border-t border-black" />
        {enc.remitenteNombre && <p className="text-[11pt]">{enc.remitenteNombre}</p>}
        {cargoFirma && <p className="text-[9.5pt] text-[#333]">{cargoFirma}</p>}
      </div>
    </article>
  );
}

function BloqueDeCuerpo({
  bloque,
  numero,
  editando,
  alCambiar,
}: {
  bloque: BloqueCuerpo;
  numero: number;
  editando: boolean;
  alCambiar: (v: string) => void;
}) {
  if (bloque.tipo === "titulo") {
    return (
      <Bloque
        editando={editando}
        texto={bloque.texto}
        alCambiar={alCambiar}
        className="pt-[2mm] text-left font-bold"
        etiqueta="Título"
      />
    );
  }
  if (bloque.tipo === "item") {
    return (
      <div className="flex gap-[3mm] pl-[12mm]">
        <span className="w-[5mm] shrink-0 text-right">{numero}.</span>
        <div className="min-w-0 flex-1">
          <Bloque editando={editando} texto={bloque.texto} alCambiar={alCambiar} etiqueta={`Punto ${numero}`} />
        </div>
      </div>
    );
  }
  return <Bloque editando={editando} texto={bloque.texto} alCambiar={alCambiar} etiqueta="Párrafo" />;
}

function Bloque({
  editando,
  texto,
  alCambiar,
  className = "",
  etiqueta,
}: {
  editando: boolean;
  texto: string;
  alCambiar: (v: string) => void;
  className?: string;
  etiqueta: string;
}) {
  if (editando) {
    return <AreaEdicion valor={texto} alCambiar={alCambiar} className={className} etiqueta={etiqueta} />;
  }
  return (
    <p className={className}>
      <ConMarcadores texto={texto} />
    </p>
  );
}

function ConMarcadores({ texto }: { texto: string }) {
  return (
    <>
      {partirMarcadores(texto).map((p, i) =>
        p.marcador ? (
          <mark key={i} className="marcador" title="Dato a completar antes de firmar">
            {p.texto.replace(/^\[\[|\]\]$/g, "")}
          </mark>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}

/** Textarea que crece con su contenido, con la misma tipografía de la hoja. */
function AreaEdicion({
  valor,
  alCambiar,
  className = "",
  etiqueta,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  className?: string;
  etiqueta: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [valor]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={valor}
      aria-label={etiqueta}
      onChange={(e) => alCambiar(e.target.value)}
      className={`campo-edicion block ${className}`}
    />
  );
}
