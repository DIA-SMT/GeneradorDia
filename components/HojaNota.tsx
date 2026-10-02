"use client";

import Image from "next/image";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import {
  datoDeMarcador,
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
  /** Completa un dato faltante en toda la nota (al tocar un recuadro amarillo). */
  alCompletarDato?: (dato: string, valor: string) => void;
};

/** Para que cada recuadro amarillo pueda completarse sin pasar la función por todos los niveles. */
const CompletarDato = createContext<((dato: string, valor: string) => void) | null>(null);

/**
 * La nota tal como se imprime, con la estructura de las notas de la
 * Municipalidad: fecha arriba a la derecha; destinatario en negrita (nombre,
 * área y «De la Municipalidad de San Miguel de Tucumán»); número de nota y
 * expediente si los hay (sin línea de referencia); cuerpo que abre con «En mi
 * carácter de…»; cierre «Sin otro particular…»; firma a la izquierda con
 * «Cargo - Área».
 *
 * El destinatario, el número, el expediente y la firma salen del formulario
 * (se corrigen con «Cambiar datos»); el cuerpo y el cierre los escribe la IA
 * y se pueden editar acá.
 */
export function HojaNota({ nota, enc, editando, alCambiar, alCompletarDato }: Props) {
  const destinatario = lineasDestinatario(enc);
  const datos = lineasDeDatos(enc);
  const cargoFirma = lineaCargoFirma(enc.remitenteCargo, enc.remitenteArea);

  const cambiarBloque = (i: number, texto: string) => {
    const cuerpo = nota.cuerpo.map((b, j) => (j === i ? { ...b, texto } : b));
    alCambiar({ ...nota, cuerpo });
  };

  // Misma numeración que el Word y el texto copiado (ver numerarCuerpo).
  const numeros = numerarCuerpo(nota.cuerpo);

  return (
    <CompletarDato.Provider value={editando ? null : (alCompletarDato ?? null)}>
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
            {/* El destinatario sale del formulario: su marcador no se completa acá. */}
            <ConMarcadores texto={l} completable={false} />
          </p>
        ))}
      </div>

      {/* Número de nota y expediente, sólo si se cargaron */}
      {datos.length > 0 && (
        <div className="mt-[5mm] space-y-[1mm] text-[10.5pt] leading-snug">
          {datos.map((d) => (
            <p key={d.etiqueta}>
              {d.etiqueta}: {d.texto}
            </p>
          ))}
        </div>
      )}

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
    </CompletarDato.Provider>
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

function ConMarcadores({ texto, completable = true }: { texto: string; completable?: boolean }) {
  const completar = useContext(CompletarDato);
  // La clave de cada recuadro es su dato y su número de aparición (no su posición en el texto): así,
  // al completar otro dato del mismo párrafo, el recuadro que se está escribiendo no se vuelve a armar.
  const vistos = new Map<string, number>();
  return (
    <>
      {partirMarcadores(texto).map((p, i) => {
        if (!p.marcador) return <span key={`t-${i}`}>{p.texto}</span>;
        const dato = datoDeMarcador(p.texto);
        const n = (vistos.get(dato) ?? 0) + 1;
        vistos.set(dato, n);
        const clave = `m-${dato}-${n}`;
        if (completar && completable) return <MarcadorEditable key={clave} dato={dato} alCompletar={completar} />;
        return (
          <mark key={clave} className="marcador" title={completable ? "Dato a completar antes de firmar" : "Se completa en los datos de la nota"}>
            COMPLETAR: {dato}
          </mark>
        );
      })}
    </>
  );
}

/**
 * Un dato faltante que se completa ahí mismo: se toca el recuadro amarillo,
 * se escribe el dato y Enter. El valor reemplaza al marcador en toda la nota.
 */
function MarcadorEditable({ dato, alCompletar }: { dato: string; alCompletar: (dato: string, valor: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState("");

  function aplicar() {
    if (valor.trim()) alCompletar(dato, valor.trim());
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="marcador cursor-pointer align-baseline transition hover:bg-[#ffe97a]"
        title="Tocá para completar este dato"
      >
        COMPLETAR: {dato}
      </button>
    );
  }

  return (
    <>
    {/* Si se imprime con el campo abierto, en el papel va la línea en blanco (el campo no se imprime). */}
    <span className="marcador hidden print:inline" aria-hidden />
    <span className="no-imprimir inline-flex max-w-full flex-wrap items-center gap-1 align-baseline">
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aplicar();
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
        placeholder={dato}
        aria-label={`Completar: ${dato}`}
        className="min-w-[14ch] rounded border border-[#e8cf3a] bg-[#fffbe0] px-1.5 py-0.5 font-sans text-[0.85em] text-tinta outline-none focus:border-smt-azul focus:ring-2 focus:ring-smt-azul/20"
        style={{ width: `${Math.min(Math.max(dato.length, 14), 48)}ch` }}
      />
      <button
        type="button"
        onClick={aplicar}
        disabled={!valor.trim()}
        className="rounded bg-smt-azul px-1.5 py-0.5 font-sans text-[0.75em] font-bold text-white disabled:bg-slate-300"
      >
        Listo
      </button>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="rounded px-1 py-0.5 font-sans text-[0.75em] font-semibold text-gris hover:text-tinta"
      >
        Cancelar
      </button>
    </span>
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
