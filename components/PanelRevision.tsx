import { AlertOctagon, AlertTriangle, CheckCircle2, Info, PenLine, Scale } from "lucide-react";
import { faltantesPendientes } from "@/lib/nota/formato";
import type { NotaGenerada } from "@/lib/nota/tipos";

const NIVELES = {
  alta: { icono: AlertOctagon, color: "text-red-600", fondo: "bg-red-50 border-red-200", nombre: "Importante" },
  media: { icono: AlertTriangle, color: "text-amber-600", fondo: "bg-amber-50 border-amber-200", nombre: "A revisar" },
  baja: { icono: Info, color: "text-smt-azul", fondo: "bg-sky-50 border-sky-200", nombre: "Sugerencia" },
} as const;

/**
 * Lo que el firmante tiene que mirar antes de firmar. `lineasArmadas` son las
 * partes de la nota que arma el sistema (como el destinatario): si tienen un
 * marcador, también cuentan como dato pendiente.
 */
export function PanelRevision({
  nota,
  lineasArmadas = [],
  alIrADatos,
}: {
  nota: NotaGenerada;
  lineasArmadas?: string[];
  /** Lleva al formulario, para completar lo que arma el sistema (como el destinatario). */
  alIrADatos?: () => void;
}) {
  const destinatarioPendiente = lineasArmadas.some((l) => l.includes("[[COMPLETAR"));
  const advertencias = [...nota.advertencias].sort(
    (a, b) => ["alta", "media", "baja"].indexOf(a.nivel) - ["alta", "media", "baja"].indexOf(b.nivel),
  );
  const faltantes = faltantesPendientes(nota, lineasArmadas);
  const limpio = faltantes.length === 0 && advertencias.length === 0;

  return (
    <section className="no-imprimir rounded-xl border border-linea bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-tinta">
        Revisión antes de firmar
      </h2>

      {limpio && (
        <p className="mt-2 flex items-start gap-2 text-[13.5px] text-emerald-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          La IA no encontró datos faltantes ni riesgos. Igual, leé la nota completa antes de firmarla.
        </p>
      )}

      {faltantes.length > 0 && (
        <div className="mt-3">
          <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-[#6b5600]">
            <PenLine className="size-4" />
            {faltantes.length === 1 ? "1 dato para completar" : `${faltantes.length} datos para completar`}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {faltantes.map((f, i) => (
              <li key={i} className="rounded-lg border border-[#efdc6b] bg-[#fffbe0] px-3 py-2 text-[13px]">
                <span className="font-semibold text-tinta">{f.dato}</span>
                {f.motivo && <span className="text-texto"> · {f.motivo}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[12px] text-gris">
            Están resaltados en amarillo en la nota. Completalos con «Editar texto» o pedile a la IA que los incorpore.
          </p>
          {destinatarioPendiente && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold text-[#6b5600]">
              El destinatario no se edita en la hoja: se completa en los datos de la nota.
              {alIrADatos && (
                <button
                  type="button"
                  onClick={alIrADatos}
                  className="rounded-md border border-[#efdc6b] bg-white px-2 py-0.5 text-[12px] font-semibold text-tinta hover:bg-[#fffbe0]"
                >
                  Completar destinatario
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {advertencias.length > 0 && (
        <div className="mt-3">
          <h3 className="text-[13px] font-bold text-tinta">Observaciones</h3>
          <ul className="mt-1.5 space-y-1.5">
            {advertencias.map((a, i) => {
              const n = NIVELES[a.nivel];
              const Icono = n.icono;
              return (
                <li key={i} className={`flex gap-2 rounded-lg border px-3 py-2 text-[13px] ${n.fondo}`}>
                  <Icono className={`mt-0.5 size-4 shrink-0 ${n.color}`} />
                  <span>
                    <span className={`font-semibold ${n.color}`}>{n.nombre}. </span>
                    {a.texto}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {nota.normas_citadas.length > 0 && (
        <div className="mt-3">
          <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-tinta">
            <Scale className="size-4" />
            Normas citadas
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {nota.normas_citadas.map((n, i) => (
              <li
                key={i}
                className="rounded-md border border-linea bg-slate-50 px-2 py-1 text-[12.5px]"
                title={n.origen === "datos_del_usuario" ? "La indicaste vos" : "Del marco normativo cargado por el municipio"}
              >
                {n.norma}
                <span className="ml-1 text-gris">
                  · {n.origen === "datos_del_usuario" ? "indicada por vos" : "marco de referencia"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
