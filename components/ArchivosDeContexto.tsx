"use client";

import { AlertCircle, FileText, Image as ImagenIcono, Loader2, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LIMITES_ADJUNTOS } from "@/lib/nota/adjuntos";
import type { ArchivoCargado } from "@/lib/nota/archivos";
import { TIPOS_ACEPTADOS } from "@/lib/nota/leer-archivo";

type Props = {
  archivos: ArchivoCargado[];
  alAgregar: (archivos: File[]) => void;
  alQuitar: (id: string) => void;
  deshabilitado?: boolean;
};

/**
 * Archivos de contexto: la nota que se responde, el expediente, una
 * resolución, fotos. Se arrastran o se eligen; se leen en el navegador y la
 * IA los usa para redactar (no se guardan en ningún lado).
 */
export function ArchivosDeContexto({ archivos, alAgregar, alQuitar, deshabilitado }: Props) {
  const [encima, setEncima] = useState(false);
  /** Lo que se anuncia a los lectores de pantalla al quitar un archivo. */
  const [anuncio, setAnuncio] = useState("");
  const lista = useRef<HTMLUListElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  /** Adónde va el foco después de quitar un archivo con el teclado (si no, quedaría en la nada). */
  const focoPendiente = useRef<string | null>(null);
  const vivos = archivos.filter((a) => a.estado !== "error").length;
  const lleno = vivos >= LIMITES_ADJUNTOS.archivos;

  useEffect(() => {
    const destino = focoPendiente.current;
    if (destino === null) return;
    focoPendiente.current = null;
    const boton = destino ? lista.current?.querySelector<HTMLButtonElement>(`[data-quitar="${destino}"]`) : null;
    (boton ?? entrada.current)?.focus();
  }, [archivos]);

  function quitar(a: ArchivoCargado) {
    const i = archivos.findIndex((x) => x.id === a.id);
    const vecino = archivos[i + 1] ?? archivos[i - 1];
    focoPendiente.current = vecino?.id ?? "";
    setAnuncio(`Se quitó ${a.nombre}.`);
    alQuitar(a.id);
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          if (deshabilitado || lleno) return;
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          if (!deshabilitado && !lleno) alAgregar([...e.dataTransfer.files]);
        }}
        className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 text-[13px] transition focus-within:border-smt-azul focus-within:ring-3 focus-within:ring-smt-azul/15 ${
          encima ? "border-smt-azul bg-sky-50" : "border-slate-300 bg-slate-50/60 hover:border-smt-azul hover:bg-sky-50/60"
        } ${deshabilitado || lleno ? "pointer-events-none opacity-60" : ""}`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-smt-azul shadow-sm">
          <Paperclip className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-tinta">
            {lleno ? (
              `Ya hay ${LIMITES_ADJUNTOS.archivos} archivos adjuntos`
            ) : (
              <>
                {/* En un teléfono no se puede arrastrar: se toca para elegir. */}
                <span className="pointer-coarse:hidden">
                  Arrastrá archivos acá o <span className="text-smt-azul underline">elegilos</span>
                </span>
                <span className="hidden pointer-coarse:inline">
                  Tocá para <span className="text-smt-azul underline">elegir archivos</span>
                </span>
              </>
            )}
          </span>
          <span className="block text-[12px] text-gris">
            PDF, Word, imágenes o texto · hasta {LIMITES_ADJUNTOS.archivos} archivos
          </span>
        </span>
        <input
          ref={entrada}
          type="file"
          multiple
          accept={TIPOS_ACEPTADOS}
          disabled={deshabilitado || lleno}
          className="sr-only"
          onChange={(e) => {
            alAgregar([...(e.target.files ?? [])]);
            e.target.value = ""; // permite volver a elegir el mismo archivo
          }}
        />
      </label>

      {archivos.length > 0 && (
        <ul ref={lista} className="mt-2 space-y-1.5" aria-live="polite">
          {archivos.map((a) => (
            <li
              key={a.id}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[13px] ${
                a.estado === "error" ? "border-red-200 bg-red-50" : "border-linea bg-white"
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {a.estado === "leyendo" ? (
                  <Loader2 className="size-4 animate-spin text-smt-azul" />
                ) : a.estado === "error" ? (
                  <AlertCircle className="size-4 text-red-600" />
                ) : a.adjunto && !a.adjunto.texto.trim() && a.adjunto.imagenes.length ? (
                  <ImagenIcono className="size-4 text-smt-azul" />
                ) : (
                  <FileText className="size-4 text-smt-azul" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-tinta" title={a.nombre}>
                  {a.nombre}
                </span>
                <span className={`block text-[12px] ${a.estado === "error" ? "text-red-700" : "text-gris"}`}>
                  {a.estado === "leyendo" ? "Leyendo…" : a.estado === "error" ? a.error : a.detalle}
                </span>
                {a.aviso && <span className="block text-[12px] text-amber-700">{a.aviso}</span>}
              </span>
              <button
                type="button"
                data-quitar={a.id}
                onClick={() => quitar(a)}
                disabled={deshabilitado}
                title="Quitar este archivo"
                aria-label={`Quitar ${a.nombre}`}
                className="shrink-0 rounded p-1 text-gris transition hover:bg-slate-100 hover:text-tinta disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
      <p className="mt-2 text-[12px] text-gris">
        La IA los usa como contexto para redactar esta nota y sus ajustes. Viajan sólo con el pedido: la aplicación
        no los guarda.
      </p>
    </div>
  );
}
