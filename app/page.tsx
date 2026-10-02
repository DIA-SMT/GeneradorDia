"use client";

import dynamic from "next/dynamic";
import { Encabezado } from "@/components/Encabezado";

// Herramienta interna: no necesita SSR, y renderizar sólo en el navegador le
// permite arrancar con la fecha local y el remitente guardado sin parpadeos.
const Generador = dynamic(() => import("@/components/Generador"), {
  ssr: false,
  loading: () => <Encabezado />,
});

export default function Pagina() {
  return <Generador />;
}
