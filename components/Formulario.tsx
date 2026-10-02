"use client";

import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Eraser,
  FileText,
  Loader2,
  MessageSquareText,
  Mic,
  PenLine,
  SlidersHorizontal,
  Sparkles,
  Square,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Autocompletar } from "@/components/Autocompletar";
import { sumarDictado, useDictado } from "@/lib/nota/dictado";
import {
  esDelPadron,
  formasDeCargo,
  opcionesDeAreas,
  opcionesDeCargos,
  opcionesDePersonas,
  type Funcionario,
} from "@/lib/nota/padron";
import { EXTENSIONES, TIPOS_NOTA, TONOS, type DatosNota, type TipoNotaId } from "@/lib/nota/tipos";

/** Los tres campos de una persona en el formulario: destinatario o quien firma. */
const CLAVES = {
  destinatario: { nombre: "destinatarioNombre", cargo: "destinatarioCargo", area: "destinatarioArea" },
  remitente: { nombre: "remitenteNombre", cargo: "remitenteCargo", area: "remitenteArea" },
} as const;
type Rol = keyof typeof CLAVES;

export type CambiarDatos = (cambios: Partial<DatosNota> | ((d: DatosNota) => Partial<DatosNota>)) => void;

const EJEMPLOS: Record<TipoNotaId, string> = {
  intimacion:
    "Ej.: Intimar al propietario del terreno baldío de calle Las Heras al 1200 a desmalezarlo y limpiarlo. La inspección lo constató el 20 de septiembre. Plazo: 10 días hábiles.",
  pedido:
    "Ej.: Pedir a la Dirección de Informática tres notebooks para el nuevo equipo de atención al vecino, que empieza a funcionar el 1 de noviembre.",
  notificacion:
    "Ej.: Notificar a la firma solicitante que su pedido de habilitación fue rechazado por la resolución que indico en antecedentes, y qué puede hacer.",
  pase: "Ej.: Pasar el expediente a Asesoría Letrada para que dictamine sobre la viabilidad del convenio propuesto.",
  informe:
    "Ej.: Informar al Secretario el estado del relevamiento de luminarias del barrio Norte: 340 relevadas, 52 fuera de servicio, 18 con riesgo eléctrico.",
  derivacion:
    "Ej.: Derivar a la Dirección de Tránsito el reclamo de un vecino por la falta de semáforo en Av. Mate de Luna y Junín.",
  dictamen:
    "Ej.: Dictaminar si corresponde otorgar la prórroga pedida por el contratista. Pegá en antecedentes la cláusula del contrato y el pedido.",
  solicitud:
    "Ej.: Solicitar al Intendente autorización para firmar un convenio con la Universidad para capacitar en IA a cincuenta agentes municipales.",
  respuesta:
    "Ej.: Responder a la vecinal del barrio Sur que la poda que pidieron quedó programada para la semana del 13 de octubre. Pegá su nota en antecedentes.",
  circular:
    "Ej.: Instruir a todas las áreas que, desde el 1 de noviembre, las notas internas se envíen sólo en formato digital por el sistema de expedientes.",
};

type Props = {
  datos: DatosNota;
  cambiar: CambiarDatos;
  funcionarios: Funcionario[];
  generando: boolean;
  hayNota: boolean;
  alGenerar: () => void;
  alLimpiar: () => void;
  alVerNota: () => void;
};

export function Formulario({ datos, cambiar, funcionarios, generando, hayNota, alGenerar, alLimpiar, alVerNota }: Props) {
  const id = useId();
  const [verAntecedentes, setVerAntecedentes] = useState(Boolean(datos.antecedentes));
  const tipoActual = TIPOS_NOTA.find((t) => t.id === datos.tipo);
  const listo = datos.motivo.trim().length >= 10;
  const dictado = useDictado((fragmento) => cambiar((d) => ({ motivo: sumarDictado(d.motivo, fragmento) })));

  const personas = useMemo(() => opcionesDePersonas(funcionarios), [funcionarios]);
  const areas = useMemo(() => opcionesDeAreas(funcionarios), [funcionarios]);
  const cargos = useMemo(() => opcionesDeCargos(funcionarios), [funcionarios]);

  /** Elegir una persona del padrón completa sus tres campos. */
  function elegirPersona(rol: Rol, f: Funcionario) {
    const k = CLAVES[rol];
    cambiar({ [k.nombre]: f.nombre, [k.cargo]: f.cargo, [k.area]: f.area });
  }

  /**
   * Elegir un área completa también a su titular, salvo que el nombre lo
   * hayas escrito a mano (alguien que no está en el padrón): ese se respeta.
   */
  function elegirArea(rol: Rol, f: Funcionario) {
    const k = CLAVES[rol];
    cambiar((d) => {
      const vacio = !d[k.nombre].trim();
      const delPadron = !vacio && esDelPadron(funcionarios, d[k.nombre]);
      // Si había otra persona del padrón, su cargo se va con ella (aunque el área nueva no tenga cargo cargado).
      if (delPadron) return { [k.area]: f.area, [k.nombre]: f.nombre, [k.cargo]: f.cargo };
      // Si no había nadie, se conserva un cargo que se haya escrito a mano.
      if (vacio) return { [k.area]: f.area, [k.nombre]: f.nombre, [k.cargo]: f.cargo || d[k.cargo] };
      return { [k.area]: f.area, ...(d[k.cargo].trim() ? {} : { [k.cargo]: f.cargo }) };
    });
  }

  const usarPadron = datos.ambito === "interno" && funcionarios.length > 0;

  return (
    <form
      className="no-imprimir flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (listo && !generando) alGenerar();
      }}
    >
      {/* Tipo de nota */}
      <Tarjeta icono={FileText} titulo="Tipo de nota">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TIPOS_NOTA.map((t) => {
            const activo = t.id === datos.tipo;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => cambiar({ tipo: t.id })}
                aria-pressed={activo}
                className={`rounded-lg border px-2 py-2.5 text-[13.5px] font-semibold leading-tight transition ${
                  activo
                    ? "border-smt-azul bg-smt-azul text-white shadow-sm"
                    : "border-linea bg-white text-tinta hover:border-smt-celeste hover:bg-sky-50"
                }`}
              >
                {t.nombre}
              </button>
            );
          })}
        </div>
        {tipoActual && <p className="mt-3 text-[13px] text-gris">{tipoActual.ayuda}</p>}
      </Tarjeta>

      {/* Destinatario y firma */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta icono={UserRound} titulo="Destinatario">
          <Segmentado
            nombre="ambito"
            valor={datos.ambito}
            opciones={[
              { id: "interno", nombre: "Área municipal" },
              { id: "externo", nombre: "Vecino o externo" },
            ]}
            alCambiar={(v) => cambiar({ ambito: v as DatosNota["ambito"] })}
          />
          <div className="mt-4 grid gap-3">
            {usarPadron && datos.tipo !== "circular" ? (
              <Campo etiqueta="Nombre" ayuda="buscá en el padrón por nombre, cargo o área" htmlFor={`${id}-dn`}>
                <Autocompletar
                  id={`${id}-dn`}
                  className={entrada}
                  valor={datos.destinatarioNombre}
                  alEscribir={(v) => cambiar({ destinatarioNombre: v })}
                  opciones={personas}
                  alElegir={(o) => elegirPersona("destinatario", o.dato)}
                  placeholder="Escribí un nombre, un cargo o un área"
                />
              </Campo>
            ) : (
              <Campo etiqueta={datos.tipo === "circular" ? "Destinatarios" : "Nombre"}>
                <input
                  className={entrada}
                  value={datos.destinatarioNombre}
                  onChange={(e) => cambiar({ destinatarioNombre: e.target.value })}
                  placeholder={datos.tipo === "circular" ? "Todas las Secretarías y Direcciones" : "Nombre o razón social"}
                />
              </Campo>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {usarPadron ? (
                <>
                  <Campo etiqueta="Cargo" htmlFor={`${id}-dc`}>
                    <Autocompletar
                      id={`${id}-dc`}
                      className={entrada}
                      valor={datos.destinatarioCargo}
                      alEscribir={(v) => cambiar({ destinatarioCargo: v })}
                      opciones={cargos}
                      alElegir={(o) => cambiar({ destinatarioCargo: o.dato })}
                      placeholder="Secretario"
                    />
                  </Campo>
                  <Campo etiqueta="Área" htmlFor={`${id}-da`}>
                    <Autocompletar
                      id={`${id}-da`}
                      className={entrada}
                      valor={datos.destinatarioArea}
                      alEscribir={(v) => cambiar({ destinatarioArea: v })}
                      opciones={areas}
                      alElegir={(o) => elegirArea("destinatario", o.dato)}
                      placeholder="Secretaría de Obras Públicas"
                    />
                  </Campo>
                </>
              ) : (
                <>
                  <Campo etiqueta="Cargo">
                    <input
                      className={entrada}
                      value={datos.destinatarioCargo}
                      onChange={(e) => cambiar({ destinatarioCargo: e.target.value })}
                      placeholder={datos.ambito === "interno" ? "Secretario de Obras Públicas" : "Opcional"}
                    />
                  </Campo>
                  <Campo etiqueta={datos.ambito === "interno" ? "Área" : "Domicilio u organismo"}>
                    <input
                      className={entrada}
                      value={datos.destinatarioArea}
                      onChange={(e) => cambiar({ destinatarioArea: e.target.value })}
                      placeholder={datos.ambito === "interno" ? "Secretaría de Obras Públicas" : "Opcional"}
                    />
                  </Campo>
                </>
              )}
            </div>
            {usarPadron && (
              <FormasDeCargo
                cargo={datos.destinatarioCargo}
                idCampo={`${id}-dc`}
                de="del destinatario"
                alElegir={(c) => cambiar({ destinatarioCargo: c })}
              />
            )}
          </div>
        </Tarjeta>

        <Tarjeta icono={PenLine} titulo="Quién firma" ayuda="Se recuerda en este navegador">
          <div className="grid gap-3">
            <Campo etiqueta="Nombre" htmlFor={`${id}-rn`}>
              <Autocompletar
                id={`${id}-rn`}
                className={entrada}
                valor={datos.remitenteNombre}
                alEscribir={(v) => cambiar({ remitenteNombre: v })}
                opciones={personas}
                alElegir={(o) => elegirPersona("remitente", o.dato)}
                placeholder="Lic. María Gómez"
              />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Cargo" htmlFor={`${id}-rc`}>
                <Autocompletar
                  id={`${id}-rc`}
                  className={entrada}
                  valor={datos.remitenteCargo}
                  alEscribir={(v) => cambiar({ remitenteCargo: v })}
                  opciones={cargos}
                  alElegir={(o) => cambiar({ remitenteCargo: o.dato })}
                  placeholder="Directora"
                />
              </Campo>
              <Campo etiqueta="Área" htmlFor={`${id}-ra`}>
                <Autocompletar
                  id={`${id}-ra`}
                  className={entrada}
                  valor={datos.remitenteArea}
                  alEscribir={(v) => cambiar({ remitenteArea: v })}
                  opciones={areas}
                  alElegir={(o) => elegirArea("remitente", o.dato)}
                  placeholder="Dirección de Inteligencia Artificial"
                />
              </Campo>
            </div>
            <FormasDeCargo
              cargo={datos.remitenteCargo}
              idCampo={`${id}-rc`}
              de="de quien firma"
              alElegir={(c) => cambiar({ remitenteCargo: c })}
            />
          </div>
        </Tarjeta>
      </div>

      {/* Contenido */}
      <Tarjeta icono={MessageSquareText} titulo="Qué necesitás comunicar">
        <div className="relative">
          <textarea
            className={`${entrada} min-h-40 resize-y leading-relaxed ${dictado.soportado ? "pr-12" : ""}`}
            value={datos.motivo}
            onChange={(e) => cambiar({ motivo: e.target.value })}
            placeholder={EJEMPLOS[datos.tipo]}
            required
          />
          {dictado.soportado && (
            <button
              type="button"
              onClick={dictado.escuchando ? dictado.detener : dictado.iniciar}
              disabled={generando}
              title={dictado.escuchando ? "Detener el dictado" : "Dictar en este campo"}
              aria-label={dictado.escuchando ? "Detener el dictado" : "Dictar en este campo"}
              className={`absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full transition disabled:opacity-50 ${
                dictado.escuchando ? "animate-pulse bg-red-600 text-white" : "bg-slate-100 text-gris hover:bg-sky-100 hover:text-smt-azul"
              }`}
            >
              {dictado.escuchando ? <Square className="size-3 fill-current" /> : <Mic className="size-4" />}
            </button>
          )}
        </div>
        {dictado.parcial && <p className="mt-1 text-[12.5px] italic text-gris">… {dictado.parcial}</p>}
        {dictado.error && <p className="mt-1 text-[12.5px] text-red-700">{dictado.error}</p>}
        <p className="mt-2 text-[12.5px] text-gris">
          Escribilo como se lo contarías a un colega: hechos, qué se pide, plazos y normas si las sabés. Lo que no
          indiques, la IA no lo inventa: lo deja marcado para completar.
        </p>

        <div className="mt-4 border-t border-linea pt-3">
          <button
            type="button"
            onClick={() => setVerAntecedentes((v) => !v)}
            className="flex items-center gap-1 text-[13px] font-semibold text-smt-azul hover:text-smt-oscuro"
            aria-expanded={verAntecedentes}
          >
            <ChevronDown className={`size-4 transition ${verAntecedentes ? "rotate-180" : ""}`} />
            Antecedentes o texto de referencia
            <span className="font-normal text-gris">{datos.antecedentes ? "(cargado)" : "(opcional)"}</span>
          </button>
          {verAntecedentes && (
            <textarea
              className={`${entrada} mt-2 min-h-28 resize-y text-[13px] leading-relaxed`}
              value={datos.antecedentes}
              onChange={(e) => cambiar({ antecedentes: e.target.value })}
              placeholder="Pegá la nota que respondés, el reclamo recibido, la parte dispositiva de una resolución o las normas que querés citar (número y artículo)."
            />
          )}
        </div>
      </Tarjeta>

      {/* Documento y estilo */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta icono={CalendarDays} titulo="Documento">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo etiqueta="Fecha">
              <input
                type="date"
                className={entrada}
                value={datos.fecha}
                onChange={(e) => cambiar({ fecha: e.target.value })}
                required
              />
            </Campo>
            <Campo etiqueta="N° de nota">
              <input
                className={entrada}
                value={datos.numeroNota}
                onChange={(e) => cambiar({ numeroNota: e.target.value })}
                placeholder="Opcional"
              />
            </Campo>
            <Campo etiqueta="Expediente" className="col-span-2 sm:col-span-1">
              <input
                className={entrada}
                value={datos.expediente}
                onChange={(e) => cambiar({ expediente: e.target.value })}
                placeholder="Opcional"
              />
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta icono={SlidersHorizontal} titulo="Estilo">
          <div className="grid gap-3">
            <div>
              <span className={etiquetaCss}>Tono</span>
              <Segmentado
                nombre="tono"
                valor={datos.tono}
                opciones={TONOS.map((t) => ({ id: t.id, nombre: t.nombre.replace(" (estándar)", "") }))}
                alCambiar={(v) => cambiar({ tono: v })}
              />
            </div>
            <div>
              <span className={etiquetaCss}>Extensión</span>
              <Segmentado
                nombre="extension"
                valor={datos.extension}
                opciones={EXTENSIONES.map((e) => ({ id: e.id, nombre: e.nombre }))}
                alCambiar={(v) => cambiar({ extension: v })}
              />
            </div>
          </div>
        </Tarjeta>
      </div>

      {/* Barra de acción */}
      <div className="sticky bottom-3 z-20 flex items-center gap-2 rounded-xl border border-linea bg-white/95 p-2.5 shadow-[0_8px_30px_rgba(16,35,61,.12)] backdrop-blur sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={alLimpiar}
          disabled={generando}
          title="Vaciar el formulario (conserva quién firma)"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-gris transition hover:bg-slate-100 hover:text-tinta disabled:opacity-50"
        >
          <Eraser className="size-4" />
          <span className="hidden sm:inline">Limpiar</span>
        </button>
        <p className="hidden flex-1 text-[12.5px] text-gris md:block">
          {listo ? "Todo listo para redactar." : "Contá qué necesitás comunicar para poder redactar."}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {hayNota && (
            <button
              type="button"
              onClick={alVerNota}
              className="whitespace-nowrap rounded-lg border border-linea px-3.5 py-2.5 text-[13.5px] font-semibold text-tinta transition hover:bg-slate-50"
            >
              Ver la nota
            </button>
          )}
          <button
            type="submit"
            disabled={!listo || generando}
            className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-smt-azul px-4 py-2.5 text-[15px] font-bold text-white shadow-sm transition hover:bg-smt-oscuro disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-5"
          >
            {generando ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            {generando ? (
              "Redactando…"
            ) : (
              <>
                <span className="sm:hidden">Redactar</span>
                <span className="hidden sm:inline">{hayNota ? "Redactar de nuevo" : "Redactar nota"}</span>
              </>
            )}
            {!generando && <ArrowRight className="hidden size-4 sm:block" />}
          </button>
        </div>
      </div>
    </form>
  );
}

const entrada =
  "w-full rounded-lg border border-linea bg-white px-3 py-2 text-[14px] text-tinta placeholder:text-slate-400 transition focus:border-smt-azul focus:outline-none focus:ring-3 focus:ring-smt-azul/15";

const etiquetaCss = "mb-1 block text-[12.5px] font-semibold text-texto";

function Tarjeta({
  icono: Icono,
  titulo,
  ayuda,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-linea bg-white p-4 shadow-sm sm:p-5">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-50 text-smt-azul">
          <Icono className="size-4" />
        </span>
        <h2 className="text-[15px] font-extrabold text-tinta">{titulo}</h2>
        {ayuda && <span className="ml-auto text-[12px] text-gris">{ayuda}</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * Un campo con su etiqueta. Con `htmlFor` la etiqueta se asocia por id y el
 * contenido queda afuera de ella: hace falta para el autocompletado, porque
 * una lista de opciones adentro de un <label> pasaría a formar parte del
 * nombre accesible del campo.
 */
function Campo({
  etiqueta,
  ayuda,
  htmlFor,
  className = "",
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const texto = (
    <>
      {etiqueta}
      {ayuda && <span className="ml-1.5 font-normal text-gris">· {ayuda}</span>}
    </>
  );
  if (htmlFor) {
    return (
      <div className={className}>
        <label htmlFor={htmlFor} className={etiquetaCss}>
          {texto}
        </label>
        {children}
      </div>
    );
  }
  return (
    <label className={`block ${className}`}>
      <span className={etiquetaCss}>{texto}</span>
      {children}
    </label>
  );
}

/**
 * Si el cargo viene del padrón en forma doble ("Director/a"), ofrece las dos
 * formas para resolverlo con un clic: en la firma no puede quedar la barra.
 * Al elegir, el bloque desaparece; el foco vuelve al campo Cargo para que
 * quien usa teclado o lector de pantalla no lo pierda.
 */
function FormasDeCargo({
  cargo,
  idCampo,
  de,
  alElegir,
}: {
  cargo: string;
  idCampo: string;
  /** "del destinatario" / "de quien firma": da contexto a los botones fuera de la pantalla. */
  de: string;
  alElegir: (c: string) => void;
}) {
  const formas = formasDeCargo(cargo);
  if (!formas) return null;
  return (
    <div
      role="group"
      aria-label={`Forma del cargo ${de}`}
      className="-mt-0.5 flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50/60 px-2.5 py-1.5 text-[12px] text-amber-800"
    >
      <span>«{cargo}» va en forma doble. Elegí:</span>
      {formas.map((f) => (
        <button
          key={f}
          type="button"
          aria-label={`Usar «${f}» como cargo ${de}`}
          onClick={() => {
            alElegir(f);
            document.getElementById(idCampo)?.focus();
          }}
          className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          {f}
        </button>
      ))}
    </div>
  );
}

function Segmentado({
  nombre,
  valor,
  opciones,
  alCambiar,
}: {
  nombre: string;
  valor: string;
  opciones: { id: string; nombre: string }[];
  alCambiar: (v: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={nombre} className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {opciones.map((o) => {
        const activo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => alCambiar(o.id)}
            className={`flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition ${
              activo ? "bg-white text-smt-oscuro shadow-sm" : "text-gris hover:text-tinta"
            }`}
          >
            {o.nombre}
          </button>
        );
      })}
    </div>
  );
}
