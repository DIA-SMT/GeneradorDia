"use client";

import { CheckCircle2, ChevronDown, Loader2, Mic, Square, Wand2 } from "lucide-react";
import { useState } from "react";
import { sumarDictado, useDictado } from "@/lib/nota/dictado";
import { aplicarExtraccion, type Funcionario } from "@/lib/nota/padron";
import type { CamposExtraidos, DatosNota } from "@/lib/nota/tipos";

type Props = {
  funcionarios: Funcionario[];
  ocupado: boolean;
  alCompletar: (cambios: Partial<DatosNota>) => void;
};

/**
 * Atajo para completar el formulario hablando o escribiendo de corrido:
 * la IA ordena lo dicho en los campos y la persona revisa antes de redactar.
 */
export function CompletarDictando({ funcionarios, ocupado, alCompletar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completados, setCompletados] = useState<string[] | null>(null);

  const dictado = useDictado((fragmento) => setTexto((t) => sumarDictado(t, fragmento)));

  function alternarDictado() {
    if (dictado.escuchando) {
      dictado.detener();
      return;
    }
    setAbierto(true);
    setCompletados(null);
    dictado.iniciar();
  }

  async function completar() {
    if (dictado.escuchando) dictado.detener();
    setCargando(true);
    setError(null);
    setCompletados(null);
    try {
      const r = await fetch("/api/extraer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const j = (await r.json()) as { campos?: CamposExtraidos; mensaje?: string };
      if (!r.ok || !j.campos) {
        setError(j.mensaje ?? "No se pudo interpretar el texto.");
        return;
      }
      const { cambios, completados } = aplicarExtraccion(j.campos, funcionarios);
      alCompletar(cambios);
      setCompletados(completados);
    } catch {
      setError("No se pudo conectar con el servidor. Revisá la conexión.");
    } finally {
      setCargando(false);
    }
  }

  const listo = texto.trim().length >= 15;

  return (
    <section className="no-imprimir rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-3.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-smt-azul text-white">
            <Mic className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-extrabold text-tinta">Contalo con tus palabras</span>
            <span className="block text-[12.5px] leading-snug text-gris">
              Dictá o escribí de corrido y la IA completa el formulario
            </span>
          </span>
          <ChevronDown className={`ml-auto size-4 shrink-0 text-gris transition ${abierto ? "rotate-180" : ""}`} />
        </button>
        {dictado.soportado && (
          <button
            type="button"
            onClick={alternarDictado}
            disabled={ocupado || cargando}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold transition disabled:opacity-50 ${
              dictado.escuchando ? "bg-red-600 text-white hover:bg-red-700" : "bg-white text-smt-oscuro shadow-sm ring-1 ring-sky-200 hover:bg-sky-50"
            }`}
          >
            {dictado.escuchando ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
            {dictado.escuchando ? "Detener" : "Dictar"}
          </button>
        )}
      </div>

      {abierto && (
        <div className="mt-3">
          {dictado.escuchando && (
            <p className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-red-700" aria-live="polite">
              <span className="size-2 animate-pulse rounded-full bg-red-600" />
              Escuchando… hablá con naturalidad y tocá Detener al terminar.
            </p>
          )}
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            placeholder="Ej.: «Nota de pedido para el secretario de Obras Públicas, pidiendo la reparación de las luminarias de calle Mendoza al 800, que están apagadas desde hace dos semanas. Es urgente. Firma la directora de Alumbrado, María Gómez.»"
            className="w-full resize-y rounded-lg border border-linea bg-white px-3 py-2 text-[13.5px] leading-relaxed text-tinta placeholder:text-slate-400 focus:border-smt-azul focus:outline-none focus:ring-3 focus:ring-smt-azul/15"
          />
          {dictado.parcial && <p className="mt-1 text-[12.5px] italic text-gris">… {dictado.parcial}</p>}
          {dictado.error && <p className="mt-1.5 text-[12.5px] text-red-700">{dictado.error}</p>}
          {error && <p className="mt-1.5 text-[12.5px] text-red-700">{error}</p>}
          {completados && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              {completados.length > 0
                ? `Completé: ${completados.join(", ")}. Revisá los datos abajo y tocá «Redactar nota».`
                : "No encontré datos para completar. Probá contando un poco más."}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={completar}
              disabled={!listo || cargando || ocupado}
              className="flex items-center gap-1.5 rounded-lg bg-smt-azul px-3.5 py-2 text-[13px] font-bold text-white transition hover:bg-smt-oscuro disabled:bg-slate-300"
            >
              {cargando ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {cargando ? "Ordenando…" : "Completar formulario"}
            </button>
            {texto && !cargando && (
              <button
                type="button"
                onClick={() => {
                  setTexto("");
                  setCompletados(null);
                }}
                className="text-[12.5px] font-semibold text-gris hover:text-tinta"
              >
                Borrar
              </button>
            )}
          </div>
          {dictado.soportado && (
            <p className="mt-2 text-[11.5px] leading-snug text-gris">
              El dictado usa el reconocimiento de voz del navegador: Chrome y Edge procesan el audio en servidores de Google
              o Microsoft. Para datos sensibles, escribí en lugar de dictar.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
