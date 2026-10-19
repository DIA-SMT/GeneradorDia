"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { LIMITES_ADJUNTOS, type Adjunto } from "./adjuntos";
import { ErrorLectura, leerArchivo } from "./leer-archivo";

/** Un archivo que se adjuntó, mientras se lee y una vez leído. */
export type ArchivoCargado = {
  id: string;
  nombre: string;
  estado: "leyendo" | "listo" | "error";
  /** Lo que se leyó: «3 páginas · 1.200 palabras». */
  detalle?: string;
  /** Algo que se dejó afuera: «Se leyeron las primeras 40 páginas». */
  aviso?: string;
  error?: string;
  adjunto?: Adjunto;
};

let siguienteId = 0;

/**
 * Los archivos de contexto de la nota. Se leen de a uno, en orden, para
 * repartir entre ellos el máximo de texto e imágenes que admite un pedido:
 * cada archivo usa lo que dejaron libre los anteriores. Si se quita uno, los
 * que habían quedado recortados (o afuera) por falta de lugar se vuelven a leer.
 */
export function useArchivos() {
  const [lista, setLista] = useState<ArchivoCargado[]>([]);
  const cola = useRef<Promise<void>>(Promise.resolve());
  /** Los archivos vivos (leyéndose o leídos), en el orden en que se adjuntaron. */
  const orden = useRef<string[]>([]);
  const originales = useRef(new Map<string, File>());
  /** Lo ya leído, por id, para calcular el lugar libre y armar el pedido. */
  const leidos = useRef(new Map<string, Adjunto>());
  /** Los que quedaron recortados o afuera por falta de lugar: se releen si se libera. */
  const sinLugar = useRef(new Set<string>());

  const actualizar = useCallback((id: string, cambios: Partial<ArchivoCargado>) => {
    setLista((l) => l.map((a) => (a.id === id ? { ...a, ...cambios } : a)));
  }, []);

  const leer = useCallback(
    async (id: string) => {
      const archivo = originales.current.get(id);
      if (!archivo) return; // se quitó mientras esperaba su turno
      const usados = orden.current.flatMap((otro) => {
        const a = otro === id ? undefined : leidos.current.get(otro);
        return a ? [a] : [];
      });
      const imagenes = usados.flatMap((a) => a.imagenes);
      const libre = {
        caracteres: LIMITES_ADJUNTOS.caracteres - usados.reduce((s, a) => s + a.texto.length, 0),
        imagenes: LIMITES_ADJUNTOS.imagenes - imagenes.length,
        base64: LIMITES_ADJUNTOS.base64Total - imagenes.reduce((s, img) => s + img.datos.length, 0),
      };
      try {
        const lectura = await leerArchivo(archivo, libre);
        if (!originales.current.has(id)) return;
        leidos.current.set(id, lectura.adjunto);
        if (lectura.limitado) sinLugar.current.add(id);
        else sinLugar.current.delete(id);
        actualizar(id, {
          estado: "listo",
          detalle: lectura.detalle,
          aviso: lectura.aviso,
          adjunto: lectura.adjunto,
          error: undefined,
        });
      } catch (e) {
        if (!originales.current.has(id)) return;
        leidos.current.delete(id);
        const porLugar = e instanceof ErrorLectura && e.porLugar;
        if (porLugar) {
          sinLugar.current.add(id); // sigue contando: se lee si se libera lugar
        } else {
          sinLugar.current.delete(id);
          originales.current.delete(id);
          orden.current = orden.current.filter((x) => x !== id);
        }
        const mensaje =
          e instanceof ErrorLectura
            ? e.message
            : "No se pudo leer este archivo. Probá guardarlo como PDF y adjuntarlo de nuevo.";
        actualizar(id, { estado: "error", error: mensaje, adjunto: undefined, detalle: undefined, aviso: undefined });
      }
    },
    [actualizar],
  );

  const encolar = useCallback(
    (id: string) => {
      cola.current = cola.current.then(() => leer(id));
    },
    [leer],
  );

  const agregar = useCallback(
    (archivos: File[]) => {
      const nuevos: ArchivoCargado[] = [];
      for (const archivo of archivos) {
        const id = `adjunto-${++siguienteId}`;
        if (orden.current.length >= LIMITES_ADJUNTOS.archivos) {
          nuevos.push({
            id,
            nombre: archivo.name,
            estado: "error",
            error: `Se pueden adjuntar hasta ${LIMITES_ADJUNTOS.archivos} archivos.`,
          });
          continue;
        }
        orden.current = [...orden.current, id];
        originales.current.set(id, archivo);
        nuevos.push({ id, nombre: archivo.name, estado: "leyendo" });
        encolar(id);
      }
      if (nuevos.length) setLista((l) => [...l, ...nuevos]);
    },
    [encolar],
  );

  const quitar = useCallback(
    (id: string) => {
      const liberaLugar = leidos.current.has(id);
      originales.current.delete(id);
      leidos.current.delete(id);
      sinLugar.current.delete(id);
      orden.current = orden.current.filter((x) => x !== id);
      setLista((l) => l.filter((a) => a.id !== id));
      // Los que habían quedado recortados o afuera por falta de lugar se vuelven a leer, en orden.
      if (liberaLugar) {
        const releer = orden.current.filter((x) => sinLugar.current.has(x));
        for (const otro of releer) {
          leidos.current.delete(otro);
          actualizar(otro, { estado: "leyendo", error: undefined, aviso: undefined });
          encolar(otro);
        }
      }
    },
    [actualizar, encolar],
  );

  const limpiar = useCallback(() => {
    originales.current.clear();
    leidos.current.clear();
    sinLugar.current.clear();
    orden.current = [];
    setLista([]);
  }, []);

  /**
   * Espera a que terminen de leerse los archivos y devuelve los leídos, en el
   * orden en que se adjuntaron. Todo pedido a la IA pasa por acá: así un ajuste
   * o una respuesta hechos mientras se lee un archivo no salen sin él.
   */
  const esperar = useCallback(async (): Promise<Adjunto[]> => {
    let pendiente: Promise<void>;
    do {
      pendiente = cola.current;
      await pendiente;
    } while (pendiente !== cola.current); // por si se encoló algo mientras tanto
    return orden.current.flatMap((id) => {
      const a = leidos.current.get(id);
      return a ? [a] : [];
    });
  }, []);

  const adjuntos = useMemo(
    () => lista.flatMap((a) => (a.estado === "listo" && a.adjunto ? [a.adjunto] : [])),
    [lista],
  );
  const leyendo = lista.some((a) => a.estado === "leyendo");

  return { lista, adjuntos, leyendo, agregar, quitar, limpiar, esperar };
}
