"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictado por voz con el reconocimiento del propio navegador (Web Speech API),
 * en español de Argentina. Funciona en Chrome y Edge; en Firefox no existe y
 * el botón no se muestra.
 *
 * Ojo con la privacidad: Chrome y Edge envían el audio a los servidores de
 * Google o Microsoft para transcribirlo. Por eso el aviso en la interfaz.
 */

type ResultadoVoz = { isFinal: boolean; 0: { transcript: string } };
type EventoVoz = { resultIndex: number; results: ArrayLike<ResultadoVoz> };
type ErrorVoz = { error: string };

type Reconocedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoVoz) => void) | null;
  onerror: ((e: ErrorVoz) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type ConstructorReconocedor = new () => Reconocedor;

function constructor(): ConstructorReconocedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstructorReconocedor;
    webkitSpeechRecognition?: ConstructorReconocedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORES: Record<string, string> = {
  "not-allowed": "El navegador no tiene permiso para usar el micrófono. Habilitalo desde el candado de la barra de direcciones.",
  "service-not-allowed": "El navegador no permite el dictado en esta página.",
  "audio-capture": "No se encontró un micrófono conectado.",
  network: "El dictado necesita conexión a internet y no pudo conectarse.",
  "no-speech": "No se escuchó nada. Probá de nuevo, más cerca del micrófono.",
};

export function useDictado(alTextoFinal: (texto: string) => void) {
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reconocedor = useRef<Reconocedor | null>(null);
  const destino = useRef(alTextoFinal);

  useEffect(() => {
    destino.current = alTextoFinal;
  }, [alTextoFinal]);

  useEffect(() => () => reconocedor.current?.abort(), []);

  const soportado = constructor() !== null;

  const iniciar = useCallback(() => {
    const C = constructor();
    if (!C) return;
    reconocedor.current?.abort();
    const r = new C();
    r.lang = "es-AR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interino = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0].transcript;
        if (res.isFinal) destino.current(t.trim());
        else interino += t;
      }
      setParcial(interino);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted") setError(ERRORES[e.error] ?? "El dictado se interrumpió. Probá de nuevo.");
    };
    r.onend = () => {
      setEscuchando(false);
      setParcial("");
    };
    setError(null);
    r.start();
    reconocedor.current = r;
    setEscuchando(true);
  }, []);

  const detener = useCallback(() => reconocedor.current?.stop(), []);

  return { soportado, escuchando, parcial, error, iniciar, detener };
}

/** Agrega un fragmento dictado a un texto existente, con el espacio justo. */
export function sumarDictado(actual: string, fragmento: string): string {
  if (!fragmento) return actual;
  if (!actual.trim()) return fragmento.charAt(0).toUpperCase() + fragmento.slice(1);
  return /\s$/.test(actual) ? actual + fragmento : `${actual} ${fragmento}`;
}
