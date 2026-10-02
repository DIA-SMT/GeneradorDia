"use client";

import { Brain, ChevronDown, PenTool, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  fase: "analizando" | "redactando";
  razonamiento: string;
  esAjuste: boolean;
  alCancelar: () => void;
};

/**
 * Mientras la IA trabaja: en qué está, cuánto lleva y, si se quiere, qué está
 * considerando. Se monta de nuevo en cada generación (lleva `key`), así que
 * el cronómetro arranca de cero solo.
 */
export function Progreso({ fase, razonamiento, esAjuste, alCancelar }: Props) {
  const [segundos, setSegundos] = useState(0);
  const [verDetalle, setVerDetalle] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const inicio = Date.now();
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (verDetalle && caja.current) caja.current.scrollTop = caja.current.scrollHeight;
  }, [razonamiento, verDetalle]);

  const pasos = [
    { id: "analizando", icono: Brain, texto: esAjuste ? "Analizando el ajuste pedido" : "Analizando el pedido, el tipo de nota y los datos" },
    { id: "redactando", icono: PenTool, texto: "Redactando y revisando la nota" },
  ] as const;
  const actual = pasos.findIndex((p) => p.id === fase);

  return (
    <section className="no-imprimir rounded-xl border border-linea bg-white p-5 shadow-sm" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-tinta">
            {esAjuste ? "Ajustando la nota" : "La IA está trabajando"}
          </h2>
          <p className="mt-0.5 text-[13px] text-gris">
            Razona con cuidado antes de escribir: suele tardar entre 20 segundos y un minuto. · {segundos} s
          </p>
        </div>
        <button
          type="button"
          onClick={alCancelar}
          className="flex items-center gap-1 rounded-lg border border-linea px-2.5 py-1.5 text-[12.5px] font-semibold text-gris hover:text-tinta"
        >
          <X className="size-3.5" /> Cancelar
        </button>
      </div>

      <ol className="mt-4 space-y-2.5">
        {pasos.map((p, i) => {
          const Icono = p.icono;
          const estado = i < actual ? "hecho" : i === actual ? "activo" : "pendiente";
          return (
            <li key={p.id} className="flex items-center gap-3">
              <span
                className={`grid size-8 place-items-center rounded-full ${
                  estado === "activo"
                    ? "bg-smt-azul text-white"
                    : estado === "hecho"
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                <Icono className={`size-4 ${estado === "activo" ? "animate-pulse" : ""}`} />
              </span>
              <span className={`text-[14px] ${estado === "pendiente" ? "text-slate-400" : "font-semibold text-tinta"}`}>
                {p.texto}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-1/3 animate-[avance_1.6s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-smt-azul to-smt-celeste" />
      </div>

      {razonamiento && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setVerDetalle((v) => !v)}
            className="flex items-center gap-1 text-[13px] font-semibold text-smt-azul"
            aria-expanded={verDetalle}
          >
            <ChevronDown className={`size-4 transition ${verDetalle ? "rotate-180" : ""}`} />
            Ver qué está considerando
          </button>
          {verDetalle && (
            <div
              ref={caja}
              className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[12.5px] leading-relaxed text-gris"
            >
              {razonamiento}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
