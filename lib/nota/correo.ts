/**
 * Envío por correo: abre el redactor de Gmail (o el programa de correo del
 * equipo) con la nota ya cargada. No adjunta archivos; para eso está el Word.
 */

export function enlaceGmail(para: string, asunto: string, cuerpo: string): string {
  const q = new URLSearchParams({ view: "cm", fs: "1", tf: "1", to: para, su: asunto, body: cuerpo });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

export function enlaceMailto(para: string, asunto: string, cuerpo: string): string {
  // mailto usa %20 para los espacios, no "+": se arma a mano.
  const enc = encodeURIComponent;
  return `mailto:${enc(para)}?subject=${enc(asunto)}&body=${enc(cuerpo)}`;
}

/** Abre el redactor de correo: Gmail en una pestaña nueva, o el programa de correo del equipo. */
export function abrirCorreo(enlace: string, enPestanaNueva: boolean): void {
  if (enPestanaNueva) window.open(enlace, "_blank", "noopener");
  else window.location.href = enlace;
}

/** Imprime la página con un título de documento a medida (es el nombre que propone «Guardar como PDF»). */
export function imprimirComo(titulo: string): void {
  const anterior = document.title;
  document.title = titulo;
  window.print();
  document.title = anterior;
}

export function correoValido(c: string): boolean {
  return c.split(/[,;]\s*/).every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim()));
}
