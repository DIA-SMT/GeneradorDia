import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Generador de Notas · Municipalidad de San Miguel de Tucumán",
  description:
    "Redacción asistida de notas administrativas de la Municipalidad de San Miguel de Tucumán. Dirección de Inteligencia Artificial.",
  icons: { icon: "/logo-muni-iso.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
