"use client";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  FilePlus2,
  FileDown,
  Mail,
  Pencil,
  Printer,
  RotateCcw,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CompletarDatos } from "@/components/CompletarDatos";
import { CompletarDictando } from "@/components/CompletarDictando";
import { Encabezado } from "@/components/Encabezado";
import { Formulario, type CambiarDatos } from "@/components/Formulario";
import { HojaNota } from "@/components/HojaNota";
import { PanelRevision } from "@/components/PanelRevision";
import { Progreso } from "@/components/Progreso";
import { abrirCorreo, correoValido, enlaceGmail, enlaceMailto, imprimirComo } from "@/lib/nota/correo";
import { descargarDocx, nombreArchivo } from "@/lib/nota/docx";
import {
  completarDato,
  conBlancos,
  faltantesPendientes,
  hoyArgentina,
  lineasDestinatario,
  notaComoTexto,
  type DatosEncabezado,
} from "@/lib/nota/formato";
import { correoDe, type Funcionario } from "@/lib/nota/padron";
import { pedirNota } from "@/lib/nota/sse";
import { nombreTipo, type DatosNota, type NotaGenerada } from "@/lib/nota/tipos";

const CLAVE_REMITENTE = "generador-notas:remitente";

const VACIO: DatosNota = {
  tipo: "pedido",
  ambito: "interno",
  fecha: "",
  numeroNota: "",
  expediente: "",
  destinatarioNombre: "",
  destinatarioCargo: "",
  destinatarioArea: "",
  remitenteNombre: "",
  remitenteCargo: "",
  remitenteArea: "",
  motivo: "",
  antecedentes: "",
  tono: "institucional",
  extension: "estandar",
};

const AJUSTES_RAPIDOS = ["Más breve", "Más firme", "Más cordial", "Lenguaje más simple", "Más detallada"];

const AJUSTE_SIN_FALTANTES =
  "Quien firma no tiene los datos marcados para completar. Quitá todos los marcadores [[COMPLETAR: …]]: reformulá cada frase en forma general, sin el dato y sin inventarlo, o quitá la oración si sin el dato no tiene sentido. Una norma que falta no se reemplaza por \"la normativa vigente\", \"las normas aplicables\" ni fórmulas parecidas: quitá la referencia y, si sin ella no se sostiene una habilitación o un apercibimiento, quitá también esa afirmación. Si sacar un dato debilita la nota, hacelo igual y explicalo en las advertencias con nivel \"alta\". No cambies el resto.";

const AJUSTE_DATOS_NUEVOS =
  "Cambiaron el destinatario o quien firma: actualizá la apertura, el cierre y toda mención a ellos según los datos actuales. No cambies el resto.";

/** Lo que define a las personas de la nota: si cambia después de redactar, la apertura y el cierre pueden no coincidir. */
function clavePersonas(d: DatosNota): string {
  return JSON.stringify(
    [d.tipo, d.ambito, d.destinatarioNombre, d.destinatarioCargo, d.destinatarioArea, d.remitenteNombre, d.remitenteCargo, d.remitenteArea].map(
      (s) => s.trim(),
    ),
  );
}

type Vista = "datos" | "nota";

type Exportacion = "copiar" | "word" | "imprimir" | "gmail" | "correo";

const NOMBRE_EXPORTACION: Record<Exportacion, string> = {
  copiar: "copiar la nota",
  word: "descargar el Word",
  imprimir: "imprimir o guardar el PDF",
  gmail: "abrir el correo",
  correo: "abrir el correo",
};

type Estado =
  | { tipo: "inicial" }
  | { tipo: "generando"; corrida: number; fase: "analizando" | "redactando"; razonamiento: string; esAjuste: boolean }
  | { tipo: "error"; mensaje: string };

function estadoInicial(): DatosNota {
  let remitente: Partial<DatosNota> = {};
  try {
    remitente = JSON.parse(localStorage.getItem(CLAVE_REMITENTE) || "{}");
  } catch {
    remitente = {};
  }
  return {
    ...VACIO,
    fecha: hoyArgentina(),
    remitenteNombre: remitente.remitenteNombre ?? "",
    remitenteCargo: remitente.remitenteCargo ?? "",
    remitenteArea: remitente.remitenteArea ?? "",
  };
}

export default function Generador() {
  // Este componente se renderiza sólo en el navegador (ver app/page.tsx), así que
  // puede leer la fecha local y el remitente recordado al crear el estado.
  const [datos, setDatos] = useState<DatosNota>(estadoInicial);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [vista, setVista] = useState<Vista>("datos");
  const [estado, setEstado] = useState<Estado>({ tipo: "inicial" });
  const [nota, setNota] = useState<NotaGenerada | null>(null);
  const [notaIA, setNotaIA] = useState<NotaGenerada | null>(null);
  const [personasDeLaNota, setPersonasDeLaNota] = useState<string | null>(null);
  const [porExportar, setPorExportar] = useState<Exportacion | null>(null);
  const [editando, setEditando] = useState(false);
  const [instruccion, setInstruccion] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [verCorreo, setVerCorreo] = useState(false);
  const [para, setPara] = useState("");
  // El último correo que se completó solo desde el padrón: si el destinatario cambia, se puede actualizar.
  const [paraAuto, setParaAuto] = useState("");
  const cancelador = useRef<AbortController | null>(null);
  const corridas = useRef(0);

  // Si se imprime con Ctrl+P en modo edición, se sale del modo antes de armar la página:
  // si no, saldrían los recuadros de edición con los datos sin completar tal cual.
  useEffect(() => {
    const antesDeImprimir = () => flushSync(() => setEditando(false));
    window.addEventListener("beforeprint", antesDeImprimir);
    return () => window.removeEventListener("beforeprint", antesDeImprimir);
  }, []);

  useEffect(() => {
    fetch("/api/funcionarios")
      .then((r) => (r.ok ? r.json() : []))
      .then((lista: Funcionario[]) => setFuncionarios(Array.isArray(lista) ? lista : []))
      .catch(() => setFuncionarios([]));
  }, []);

  // Quien firma se recuerda en este navegador para la próxima nota.
  const { remitenteNombre, remitenteCargo, remitenteArea } = datos;
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_REMITENTE, JSON.stringify({ remitenteNombre, remitenteCargo, remitenteArea }));
    } catch {
      /* sin almacenamiento local: no se recuerda, y listo */
    }
  }, [remitenteNombre, remitenteCargo, remitenteArea]);

  const cambiar = useCallback<CambiarDatos>((cambios) => {
    setDatos((d) => ({ ...d, ...(typeof cambios === "function" ? cambios(d) : cambios) }));
  }, []);

  function irA(v: Vista) {
    setVista(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generar(ajuste?: string) {
    cancelador.current?.abort();
    const control = new AbortController();
    cancelador.current = control;
    const esAjuste = Boolean(ajuste && nota);
    const personasEnviadas = clavePersonas(datos);
    setEditando(false);
    corridas.current += 1;
    setEstado({ tipo: "generando", corrida: corridas.current, fase: "analizando", razonamiento: "", esAjuste });
    irA("nota");

    let terminado = false;
    const fallar = (mensaje: string) => {
      setEstado({ tipo: "error", mensaje });
      // Si todavía no hay nota, el error se muestra junto al formulario para corregir y reintentar.
      if (!nota) setVista("datos");
    };

    try {
      await pedirNota(
        { datos, ajuste: esAjuste && nota ? { borrador: nota, instruccion: ajuste! } : undefined },
        (ev) => {
          if (ev.tipo === "fase") {
            setEstado((e) => (e.tipo === "generando" ? { ...e, fase: ev.fase } : e));
          } else if (ev.tipo === "razonamiento") {
            setEstado((e) => (e.tipo === "generando" ? { ...e, razonamiento: e.razonamiento + ev.texto } : e));
          } else if (ev.tipo === "resultado") {
            terminado = true;
            setNota(ev.nota);
            setNotaIA(ev.nota);
            setPersonasDeLaNota(personasEnviadas);
            setInstruccion("");
            setEstado({ tipo: "inicial" });
          } else if (ev.tipo === "error") {
            terminado = true;
            fallar(ev.mensaje);
          }
        },
        control.signal,
      );
      if (!terminado && !control.signal.aborted) fallar("Se cortó la conexión antes de terminar. Volvé a intentar.");
    } catch {
      if (!control.signal.aborted) fallar("No se pudo conectar con el servidor. Revisá la conexión.");
    }
  }

  function cancelar() {
    cancelador.current?.abort();
    setEstado({ tipo: "inicial" });
    if (!nota) setVista("datos");
  }

  function nuevaNota() {
    cancelador.current?.abort();
    setDatos((d) => ({
      ...VACIO,
      fecha: hoyArgentina(),
      remitenteNombre: d.remitenteNombre,
      remitenteCargo: d.remitenteCargo,
      remitenteArea: d.remitenteArea,
    }));
    setNota(null);
    setNotaIA(null);
    setPersonasDeLaNota(null);
    setEditando(false);
    setVerCorreo(false);
    setPara("");
    setParaAuto("");
    setEstado({ tipo: "inicial" });
    irA("datos");
  }

  const correoPadron =
    datos.ambito === "interno" ? correoDe(funcionarios, datos.destinatarioNombre, datos.destinatarioArea) : "";

  // El correo propuesto sigue al destinatario: si cambia, se actualiza (o se vacía si el nuevo no tiene),
  // salvo que se haya escrito uno a mano. Se ajusta durante el render, comparando con el valor anterior.
  const [correoPrevio, setCorreoPrevio] = useState(correoPadron);
  if (correoPadron !== correoPrevio) {
    setCorreoPrevio(correoPadron);
    if (!para.trim() || para === paraAuto) {
      setPara(correoPadron);
      setParaAuto(correoPadron);
    }
  }

  function alternarCorreo() {
    setVerCorreo((v) => !v);
  }

  // Lo que la hoja toma del formulario (en vivo): fecha, destinatario, número, expediente y firma.
  const enc: DatosEncabezado = {
    fecha: datos.fecha || hoyArgentina(),
    numeroNota: datos.numeroNota,
    expediente: datos.expediente,
    ambito: datos.ambito,
    destinatarioNombre: datos.destinatarioNombre,
    destinatarioCargo: datos.destinatarioCargo,
    destinatarioArea: datos.destinatarioArea,
    remitenteNombre: datos.remitenteNombre,
    remitenteCargo: datos.remitenteCargo,
    remitenteArea: datos.remitenteArea,
  };

  /** Completa un dato faltante en toda la nota (desde la hoja, el panel o el aviso antes de exportar). */
  function completarUnDato(dato: string, valor: string) {
    // Mientras la IA reescribe, lo completado se perdería al llegar su respuesta.
    if (estado.tipo === "generando") return;
    setNota((n) => (n ? completarDato(n, dato, valor) : n));
  }

  function ejecutar(accion: Exportacion) {
    if (!nota) return;
    if (accion === "copiar") void copiar();
    else if (accion === "word") void descargarDocx(nota, { ...enc, tipoNombre: nombreTipo(datos.tipo) });
    else if (accion === "imprimir") imprimir();
    else enviarCorreo(accion === "gmail" ? "gmail" : "otro");
  }

  /**
   * Toda salida (Word, PDF, copia, correo) pasa por acá: si quedan datos sin
   * completar, primero se avisa y se ofrece completarlos. En el producto final
   * nunca sale el amarillo: lo que quede sin completar sale como línea en blanco.
   */
  function exportar(accion: Exportacion) {
    if (pendientes > 0) setPorExportar(accion);
    else ejecutar(accion);
  }

  function continuarExportacion() {
    const accion = porExportar;
    if (!accion) return;
    // Se cierra el aviso antes de imprimir o copiar (sigue siendo el mismo clic, que el navegador exige).
    flushSync(() => setPorExportar(null));
    ejecutar(accion);
  }

  async function copiar() {
    if (!nota) return;
    try {
      await navigator.clipboard.writeText(notaComoTexto(nota, enc));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setEstado({ tipo: "error", mensaje: "El navegador no permitió copiar. Seleccioná el texto a mano." });
    }
  }

  function imprimir() {
    // En modo edición la hoja tiene recuadros de edición: se sale y se redibuja antes de imprimir.
    if (editando) flushSync(() => setEditando(false));
    imprimirComo(nombreArchivo({ ...enc, tipoNombre: nombreTipo(datos.tipo) }, "pdf").replace(/\.pdf$/, ""));
  }

  function enviarCorreo(via: "gmail" | "otro") {
    if (!nota) return;
    const referencia = conBlancos(nota.referencia).trim();
    // El asunto que escribió la IA (no se imprime en la nota) sirve como asunto del correo.
    const asunto =
      referencia ||
      [nombreTipo(datos.tipo), datos.numeroNota.trim() || datos.expediente.trim()].filter(Boolean).join(" ");
    const cuerpo = notaComoTexto(nota, enc);
    if (via === "gmail") abrirCorreo(enlaceGmail(para.trim(), asunto, cuerpo), true);
    else abrirCorreo(enlaceMailto(para.trim(), asunto, cuerpo), false);
  }

  const generando = estado.tipo === "generando";
  const editadaAMano = nota !== notaIA;
  const lineasArmadas = lineasDestinatario(enc);
  // El encabezado y la firma siguen al formulario en vivo, pero la apertura y el cierre los escribió la IA:
  // si después de redactar cambian el destinatario o quien firma, pueden dejar de coincidir.
  const desactualizada =
    Boolean(nota) && !generando && personasDeLaNota !== null && personasDeLaNota !== clavePersonas(datos);
  const pendientes = nota ? faltantesPendientes(nota, lineasArmadas).length : 0;
  // Los que escribió la IA (sin contar el destinatario, que sale del formulario): sólo esos los puede resolver ella.
  const pendientesDeLaIA = nota ? faltantesPendientes(nota).length : 0;
  const soloFaltaDestinatario = pendientes > 0 && pendientesDeLaIA === 0;
  const paraValido = para.trim() === "" || correoValido(para);

  const avisoError = estado.tipo === "error" && (
    <div className="no-imprimir mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-[14px] text-red-800">
      <AlertCircle className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1">{estado.mensaje}</div>
      <button type="button" className="text-[13px] font-semibold underline" onClick={() => setEstado({ tipo: "inicial" })}>
        Cerrar
      </button>
    </div>
  );

  const pasos = (
    <Pasos
      vista={vista}
      notaDisponible={Boolean(nota) || generando}
      alElegir={irA}
      extra={
        vista === "nota" && (
          <button
            type="button"
            onClick={nuevaNota}
            className="flex items-center gap-1.5 rounded-lg border border-linea bg-white px-3 py-2 text-[13px] font-semibold text-tinta shadow-sm transition hover:bg-slate-50"
          >
            <FilePlus2 className="size-4" />
            <span className="hidden sm:inline">Nueva nota</span>
          </button>
        )
      }
    />
  );

  return (
    <>
      <Encabezado />

      {vista === "datos" ? (
        <main className="mx-auto max-w-[1080px] px-4 pb-8 pt-5 sm:px-6">
          {pasos}
          {avisoError}
          <div className="mt-4">
            <CompletarDictando funcionarios={funcionarios} ocupado={generando} alCompletar={cambiar} />
          </div>
          <div className="mt-4">
            <Formulario
              datos={datos}
              cambiar={cambiar}
              funcionarios={funcionarios}
              generando={generando}
              hayNota={Boolean(nota)}
              alGenerar={() => generar()}
              alLimpiar={nuevaNota}
              alVerNota={() => irA("nota")}
            />
          </div>
        </main>
      ) : (
        <main className="vista-nota mx-auto max-w-[1320px] px-4 pb-10 pt-5 sm:px-6">
          {pasos}
          {avisoError}

          <div className="grilla-nota mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            {/* Columna de la hoja */}
            <div className="columna-hoja flex min-w-0 flex-col gap-4">
              {estado.tipo === "generando" && (
                <Progreso
                  key={estado.corrida}
                  fase={estado.fase}
                  razonamiento={estado.razonamiento}
                  esAjuste={estado.esAjuste}
                  alCancelar={cancelar}
                />
              )}
              {nota && (
                <>
                  {/* Barra de edición, pegada a la hoja */}
                  <div className="no-imprimir flex flex-wrap items-center gap-2 rounded-xl border border-linea bg-white p-2.5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setEditando((v) => !v)}
                      disabled={generando}
                      className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13.5px] font-bold transition disabled:opacity-50 ${
                        editando ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-smt-azul text-white hover:bg-smt-oscuro"
                      }`}
                    >
                      {editando ? <Check className="size-4" /> : <Pencil className="size-4" />}
                      {editando ? "Terminar edición" : "Editar nota"}
                    </button>
                    {editadaAMano && !editando && (
                      <button
                        type="button"
                        onClick={() => setNota(notaIA)}
                        disabled={generando}
                        title="Volver a la versión que redactó la IA"
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-gris transition hover:bg-slate-100 hover:text-tinta disabled:opacity-50"
                      >
                        <RotateCcw className="size-4" />
                        Deshacer cambios
                      </button>
                    )}
                    <p className="ml-auto text-[12.5px] text-gris">
                      {editando
                        ? "Escribí directamente sobre la hoja. El destinatario y la firma se cambian en «Cambiar datos»."
                        : soloFaltaDestinatario
                          ? "Falta el destinatario: completalo en «Cambiar datos»."
                          : pendientes > 0
                            ? `${pendientes === 1 ? "Falta 1 dato" : `Faltan ${pendientes} datos`}: tocá lo resaltado en amarillo para completarlo.`
                            : "La nota está completa."}
                    </p>
                  </div>
                  {/* Mientras la IA reescribe, la hoja no se toca: lo que se completara se perdería con su respuesta. */}
                  <div
                    className={`zona-hoja rounded-xl bg-slate-200/60 p-3 transition sm:p-6 ${generando ? "pointer-events-none opacity-40" : ""}`}
                    aria-busy={generando}
                  >
                    <HojaNota
                      nota={nota}
                      enc={enc}
                      editando={editando}
                      alCambiar={setNota}
                      alCompletarDato={generando ? undefined : completarUnDato}
                    />
                  </div>
                  <p className="no-imprimir flex items-start gap-2 px-1 text-[12.5px] text-gris">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                    Borrador generado con IA. La responsabilidad por el contenido es de quien firma: verificá datos,
                    normas y plazos antes de dar curso a la nota.
                  </p>
                </>
              )}
            </div>

            {/* Columna lateral: acciones, ajustes y revisión */}
            {nota && (
              <aside className="no-imprimir order-first flex flex-col gap-4 lg:sticky lg:top-4 lg:order-none lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
                {desactualizada && (
                  <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-900 shadow-sm">
                    <p className="font-semibold">Cambiaste el destinatario o quién firma después de redactar.</p>
                    <p className="mt-1">
                      El encabezado y la firma ya se actualizaron, pero la apertura y el cierre pueden no coincidir
                      (por ejemplo, «lo saludo» o el cargo de quien firma).
                    </p>
                    <button
                      type="button"
                      onClick={() => generar(AJUSTE_DATOS_NUEVOS)}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-[13px] font-bold text-white transition hover:bg-amber-700"
                    >
                      <Wand2 className="size-4" />
                      Actualizar apertura y cierre
                    </button>
                  </section>
                )}
                <section className="rounded-xl border border-linea bg-white p-4 shadow-sm">
                  <h2 className="text-[15px] font-extrabold text-tinta">Acciones</h2>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <BotonAccion onClick={() => exportar("copiar")} disabled={generando}>
                      {copiado ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                      {copiado ? "Copiado" : "Copiar"}
                    </BotonAccion>
                    <BotonAccion onClick={() => exportar("word")} disabled={generando}>
                      <FileDown className="size-4" />
                      Word
                    </BotonAccion>
                    <BotonAccion onClick={() => exportar("imprimir")} disabled={generando}>
                      <Printer className="size-4" />
                      Imprimir / PDF
                    </BotonAccion>
                    <BotonAccion activo={verCorreo} onClick={alternarCorreo} disabled={generando}>
                      <Mail className="size-4" />
                      Correo
                    </BotonAccion>
                    <BotonAccion onClick={() => irA("datos")} disabled={generando} className="col-span-2">
                      <ArrowLeft className="size-4" />
                      Cambiar datos (destinatario, firma, expediente)
                    </BotonAccion>
                  </div>

                  {verCorreo && (
                    <div className="mt-3 border-t border-linea pt-3">
                      <input
                        type="email"
                        multiple
                        value={para}
                        onChange={(e) => setPara(e.target.value)}
                        placeholder="Para: correo del destinatario (opcional)"
                        aria-label="Correo del destinatario"
                        className={`w-full rounded-lg border px-3 py-2 text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-3 focus:ring-smt-azul/15 ${
                          paraValido ? "border-linea focus:border-smt-azul" : "border-red-300"
                        }`}
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!paraValido}
                          onClick={() => exportar("gmail")}
                          className="rounded-lg bg-smt-azul px-3 py-2 text-[13.5px] font-bold text-white transition hover:bg-smt-oscuro disabled:bg-slate-300"
                        >
                          Abrir en Gmail
                        </button>
                        <button
                          type="button"
                          disabled={!paraValido}
                          onClick={() => exportar("correo")}
                          className="rounded-lg border border-linea px-3 py-2 text-[13.5px] font-semibold text-tinta transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          Otro programa
                        </button>
                      </div>
                      {para && para === correoPadron && (
                        <p className="mt-1 text-[12px] text-gris">Correo tomado del padrón de funcionarios.</p>
                      )}
                      <p className={`mt-2 text-[12px] ${pendientes > 0 ? "font-semibold text-amber-700" : "text-gris"}`}>
                        {pendientes > 0
                          ? `Atención: la nota todavía tiene ${pendientes === 1 ? "1 dato" : `${pendientes} datos`} sin completar.`
                          : "Se abre el correo con la nota en el cuerpo. Para enviarla con membrete, descargá el Word y adjuntalo."}
                      </p>
                    </div>
                  )}
                </section>

                <form
                  className="rounded-xl border border-linea bg-white p-4 shadow-sm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (instruccion.trim().length >= 3 && !generando) generar(instruccion.trim());
                  }}
                >
                  <h2 className="text-[15px] font-extrabold text-tinta">Ajustar con IA</h2>
                  <textarea
                    value={instruccion}
                    onChange={(e) => setInstruccion(e.target.value)}
                    rows={2}
                    placeholder="Ej.: «el plazo es de 5 días hábiles», «agregá que se adjunta el informe técnico»"
                    className="mt-3 w-full resize-none rounded-lg border border-linea px-3 py-2 text-[13.5px] placeholder:text-slate-400 focus:border-smt-azul focus:outline-none focus:ring-3 focus:ring-smt-azul/15"
                    disabled={generando}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {AJUSTES_RAPIDOS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        disabled={generando}
                        onClick={() => generar(a)}
                        className="rounded-full border border-linea bg-slate-50 px-2.5 py-1 text-[12.5px] font-semibold text-texto transition hover:border-smt-celeste hover:bg-sky-50 disabled:opacity-50"
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={generando || instruccion.trim().length < 3}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-smt-profundo px-3.5 py-2 text-[13.5px] font-bold text-white transition hover:bg-smt-oscuro disabled:bg-slate-300"
                  >
                    <Wand2 className="size-4" />
                    Aplicar ajuste
                  </button>
                </form>

                <PanelRevision
                  nota={nota}
                  lineasArmadas={lineasArmadas}
                  alIrADatos={() => irA("datos")}
                  alCompletarDato={completarUnDato}
                  alResolverConIA={pendientesDeLaIA > 0 ? () => generar(AJUSTE_SIN_FALTANTES) : undefined}
                  ocupado={generando}
                />
              </aside>
            )}
          </div>
        </main>
      )}

      {porExportar && nota && (
        <AntesDeExportar
          accion={NOMBRE_EXPORTACION[porExportar]}
          faltantes={faltantesPendientes(nota, lineasArmadas)}
          alCompletar={completarUnDato}
          alIrADatos={() => {
            setPorExportar(null);
            irA("datos");
          }}
          alContinuar={continuarExportacion}
          alResolverConIA={
            pendientesDeLaIA > 0
              ? () => {
                  setPorExportar(null);
                  generar(AJUSTE_SIN_FALTANTES);
                }
              : undefined
          }
          alCerrar={() => setPorExportar(null)}
        />
      )}
    </>
  );
}

/**
 * Aviso antes de sacar la nota (Word, PDF, copia o correo) cuando quedan datos
 * sin completar: se pueden completar ahí mismo, seguir con líneas en blanco
 * para completar a mano, o pedirle a la IA que redacte sin esos datos.
 */
function AntesDeExportar({
  accion,
  faltantes,
  alCompletar,
  alIrADatos,
  alContinuar,
  alResolverConIA,
  alCerrar,
}: {
  accion: string;
  faltantes: NotaGenerada["faltantes"];
  alCompletar: (dato: string, valor: string) => void;
  alIrADatos: () => void;
  alContinuar: () => void;
  /** Ausente cuando lo único pendiente es el destinatario: la IA no puede resolverlo. */
  alResolverConIA?: () => void;
  alCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const completa = faltantes.length === 0;

  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      aria-labelledby="antes-de-exportar"
      className="no-imprimir m-auto w-[min(560px,calc(100vw-2rem))] rounded-xl border border-linea bg-white p-0 text-texto shadow-[0_24px_64px_rgba(16,35,61,.28)] backdrop:bg-tinta/40"
    >
      <div className="p-5">
        <h2 id="antes-de-exportar" className="text-[16px] font-extrabold text-tinta">
          {completa
            ? "La nota ya está completa"
            : `Antes de ${accion}: ${faltantes.length === 1 ? "falta 1 dato" : `faltan ${faltantes.length} datos`}`}
        </h2>
        <p className="mt-1 text-[13px] text-gris">
          {completa
            ? "Ya no queda nada por completar."
            : "En el documento final no sale el amarillo. Completalos acá o elegí cómo seguir."}
        </p>

        {!completa && (
          <div className="mt-3 max-h-[50dvh] overflow-y-auto">
            <CompletarDatos faltantes={faltantes} alCompletar={alCompletar} alIrADatos={alIrADatos} />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-lg px-3.5 py-2 text-[13.5px] font-semibold text-gris transition hover:bg-slate-100 hover:text-tinta"
          >
            Cancelar
          </button>
          {!completa && (
            <>
              {alResolverConIA && (
                <button
                  type="button"
                  onClick={alResolverConIA}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-linea px-3.5 py-2 text-[13.5px] font-semibold text-tinta transition hover:bg-slate-50"
                >
                  <Wand2 className="size-4" />
                  Que la IA redacte sin esos datos
                </button>
              )}
              <button
                type="button"
                onClick={alContinuar}
                className="rounded-lg border border-linea px-3.5 py-2 text-[13.5px] font-semibold text-tinta transition hover:bg-slate-50"
              >
                Seguir con líneas en blanco
              </button>
            </>
          )}
          {completa && (
            <button
              type="button"
              autoFocus
              onClick={alContinuar}
              className="rounded-lg bg-smt-azul px-4 py-2 text-[13.5px] font-bold text-white transition hover:bg-smt-oscuro"
            >
              Continuar
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

/** Indicador de los dos pasos: datos → nota. Se puede ir y volver sin perder nada. */
function Pasos({
  vista,
  notaDisponible,
  alElegir,
  extra,
}: {
  vista: Vista;
  notaDisponible: boolean;
  alElegir: (v: Vista) => void;
  extra?: React.ReactNode;
}) {
  const items: { id: Vista; numero: number; texto: string; habilitado: boolean }[] = [
    { id: "datos", numero: 1, texto: "Datos de la nota", habilitado: true },
    { id: "nota", numero: 2, texto: "Nota redactada", habilitado: notaDisponible },
  ];
  return (
    <nav className="no-imprimir flex items-center gap-3" aria-label="Pasos">
      {items.map((p, i) => {
        const activo = p.id === vista;
        return (
          <div key={p.id} className="flex items-center gap-3">
            {i > 0 && <span className="h-px w-8 bg-slate-300 sm:w-16" aria-hidden />}
            <button
              type="button"
              disabled={!p.habilitado || activo}
              onClick={() => alElegir(p.id)}
              aria-current={activo ? "step" : undefined}
              className="group flex items-center gap-2 disabled:cursor-default"
            >
              <span
                className={`grid size-7 place-items-center rounded-full text-[13px] font-bold transition ${
                  activo
                    ? "bg-smt-azul text-white"
                    : p.habilitado
                      ? "bg-white text-smt-azul ring-1 ring-smt-azul group-hover:bg-sky-50"
                      : "bg-slate-200 text-slate-400"
                }`}
              >
                {p.numero}
              </span>
              <span
                className={`text-[14px] font-bold ${
                  activo ? "text-tinta" : p.habilitado ? "text-smt-azul group-hover:underline" : "text-slate-400"
                }`}
              >
                {p.texto}
              </span>
            </button>
          </div>
        );
      })}
      {extra && <div className="ml-auto">{extra}</div>}
    </nav>
  );
}

function BotonAccion({
  children,
  activo,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { activo?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[13.5px] font-semibold transition disabled:opacity-50 ${
        activo
          ? "border-smt-azul bg-smt-azul text-white"
          : "border-linea bg-white text-tinta hover:border-slate-300 hover:bg-slate-50"
      } ${className}`}
    >
      {children}
    </button>
  );
}
