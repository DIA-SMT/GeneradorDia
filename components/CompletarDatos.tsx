"use client";

import { useState } from "react";
import type { NotaGenerada } from "@/lib/nota/tipos";

type Props = {
  faltantes: NotaGenerada["faltantes"];
  alCompletar: (dato: string, valor: string) => void;
  /** Lleva al formulario: el destinatario no se completa en la nota sino en los datos. */
  alIrADatos?: () => void;
  /** Mientras la IA reescribe la nota no se completa nada: se perdería con su respuesta. */
  ocupado?: boolean;
};

/** El dato que agrega el sistema cuando el formulario no tiene destinatario. */
const DESTINATARIO = "destinatario";

/**
 * La lista de datos que faltan, cada uno con su campo para completarlo. Al
 * completar uno, el valor reemplaza al recuadro amarillo en toda la nota y
 * el dato desaparece de la lista.
 */
export function CompletarDatos({ faltantes, alCompletar, alIrADatos, ocupado = false }: Props) {
  const [valores, setValores] = useState<Record<string, string>>({});

  function aplicar(dato: string) {
    const valor = valores[dato]?.trim();
    if (!valor) return;
    alCompletar(dato, valor);
    setValores((v) => ({ ...v, [dato]: "" }));
  }

  return (
    <ul className="space-y-2">
      {faltantes.map((f) => {
        const esDestinatario = f.dato.trim().toLowerCase() === DESTINATARIO;
        return (
          <li key={f.dato} className="rounded-lg border border-[#efdc6b] bg-[#fffbe0] px-3 py-2.5 text-[13px]">
            <p>
              <span className="font-semibold text-tinta">{esDestinatario ? "Destinatario" : f.dato}</span>
              {f.motivo && <span className="text-texto"> · {f.motivo}</span>}
            </p>
            {esDestinatario ? (
              alIrADatos && (
                <button
                  type="button"
                  onClick={alIrADatos}
                  disabled={ocupado}
                  className="mt-1.5 rounded-md border disabled:opacity-50 border-[#e8cf3a] bg-white px-2.5 py-1 text-[12.5px] font-semibold text-tinta hover:bg-[#fff6c2]"
                >
                  Completar en los datos de la nota
                </button>
              )
            ) : (
              <form
                className="mt-1.5 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  aplicar(f.dato);
                }}
              >
                <input
                  value={valores[f.dato] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [f.dato]: e.target.value }))}
                  disabled={ocupado}
                  placeholder="Escribí el dato"
                  aria-label={`Completar: ${f.dato}`}
                  className="min-w-0 flex-1 rounded-md border border-[#e8cf3a] bg-white px-2 py-1 text-[13px] text-tinta placeholder:text-slate-400 focus:border-smt-azul focus:outline-none focus:ring-2 focus:ring-smt-azul/20"
                />
                <button
                  type="submit"
                  disabled={ocupado || !valores[f.dato]?.trim()}
                  className="rounded-md bg-smt-azul px-2.5 py-1 text-[12.5px] font-bold text-white transition hover:bg-smt-oscuro disabled:bg-slate-300"
                >
                  Completar
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
