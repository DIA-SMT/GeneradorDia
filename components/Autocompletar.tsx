"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filtrarOpciones, type Opcion } from "@/lib/nota/padron";

type Props<T> = {
  /** id del input, para asociarle su etiqueta. */
  id: string;
  valor: string;
  alEscribir: (valor: string) => void;
  opciones: Opcion<T>[];
  alElegir: (opcion: Opcion<T>) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Campo de texto libre con sugerencias del padrón (patrón "combobox" de
 * WAI-ARIA 1.2). Se puede escribir cualquier cosa; las sugerencias son una
 * ayuda, no una restricción.
 *
 * La lista se abre al escribir, al hacer clic o con ↓ / ↑ (que además marcan
 * la primera o la última opción; Alt+↓ sólo abre). No se abre sola al recibir
 * el foco, para que recorrer el formulario con Tab no despliegue listas.
 * Enter elige, Esc cierra.
 */
export function Autocompletar<T>({ id, valor, alEscribir, opciones, alElegir, placeholder, className = "" }: Props<T>) {
  const idLista = useId();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  // Después de elegir una opción se muestran todas, no sólo la elegida: así es fácil cambiarla.
  const [filtrar, setFiltrar] = useState(true);
  const lista = useRef<HTMLUListElement>(null);

  const resultados = useMemo(() => filtrarOpciones(opciones, filtrar ? valor : ""), [opciones, valor, filtrar]);
  const visible = abierto && opciones.length > 0;
  const conLista = visible && resultados.length > 0;

  useEffect(() => {
    if (activo < 0 || !lista.current) return;
    lista.current.querySelector<HTMLElement>(`[data-indice="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  function cerrar() {
    setAbierto(false);
    setActivo(-1);
  }

  function elegir(o: Opcion<T>) {
    alElegir(o);
    setFiltrar(false);
    cerrar();
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = resultados.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (opciones.length === 0) return;
      e.preventDefault();
      const abajo = e.key === "ArrowDown";
      if (!visible) {
        setAbierto(true);
        // Alt+↓ sólo abre; ↓ y ↑ abren y marcan la primera o la última opción.
        setActivo(e.altKey || n === 0 ? -1 : abajo ? 0 : n - 1);
        return;
      }
      if (n === 0) return;
      setActivo((a) => (abajo ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter") {
      // Enter elige la sugerencia marcada; con la lista abierta y nada marcado, cierra sin enviar el formulario.
      if (conLista && activo >= 0 && resultados[activo]) {
        e.preventDefault();
        elegir(resultados[activo]);
      } else if (visible) {
        e.preventDefault();
        cerrar();
      }
    } else if (e.key === "Escape") {
      if (visible) {
        e.preventDefault();
        cerrar();
      }
    } else if (e.key === "Tab") {
      cerrar();
    }
  }

  const idActivo = conLista && activo >= 0 && activo < resultados.length ? `${idLista}-${activo}` : undefined;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={conLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={idActivo}
        autoComplete="off"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => {
          alEscribir(e.target.value);
          setFiltrar(true);
          setAbierto(true);
          setActivo(-1);
        }}
        onClick={() => {
          if (visible) cerrar();
          else setAbierto(true);
        }}
        onBlur={cerrar}
        onKeyDown={alTeclear}
        className={`${className} pr-8`}
      />
      {opciones.length > 0 && (
        <ChevronDown
          aria-hidden
          className={`pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 transition ${conLista ? "rotate-180" : ""}`}
        />
      )}

      {conLista && (
        <ul
          ref={lista}
          id={idLista}
          role="listbox"
          // Evita que el input pierda el foco (y se cierre la lista) antes de que el clic llegue a la opción.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-linea bg-white py-1 shadow-[0_12px_32px_rgba(16,35,61,.16)]"
        >
          {resultados.map((o, i) => (
            <li
              key={o.clave}
              id={`${idLista}-${i}`}
              data-indice={i}
              role="option"
              aria-selected={i === activo}
              onClick={() => elegir(o)}
              onMouseMove={() => i !== activo && setActivo(i)}
              className={`cursor-pointer px-3 py-2 ${i === activo ? "bg-sky-50" : ""}`}
            >
              <span className="block text-[13.5px] font-semibold leading-snug text-tinta">{o.titulo}</span>
              {o.detalle && <span className="block text-[12px] leading-snug text-gris">{o.detalle}</span>}
            </li>
          ))}
        </ul>
      )}

      {/* Sin coincidencias: aviso anunciado por el lector de pantalla, fuera de la lista (que no puede quedar vacía). */}
      <div role="status" className={visible && !conLista ? "absolute left-0 right-0 top-full z-30 mt-1" : "sr-only"}>
        {visible && !conLista && (
          <p className="rounded-lg border border-linea bg-white px-3 py-2.5 text-[12.5px] text-gris shadow-[0_12px_32px_rgba(16,35,61,.16)]">
            Sin coincidencias en el padrón. Podés escribirlo igual.
          </p>
        )}
      </div>
    </div>
  );
}
