/**
 * Copia a public/pdfjs/<versión>/ los recursos que pdf.js carga aparte al
 * leer un PDF adjunto: los decodificadores en WebAssembly (sin ellos, las
 * páginas escaneadas en JBIG2 o CCITT, muy comunes en las multifunción de
 * oficina, se leen en blanco), los mapas de caracteres, las fuentes estándar
 * y los perfiles de color.
 *
 * Corre solo antes de `npm run dev` y de `npm run build` (predev / prebuild),
 * así la copia siempre coincide con la versión instalada. La carpeta no se
 * sube al repositorio (.gitignore).
 */
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "node_modules", "pdfjs-dist");
const { version } = JSON.parse(readFileSync(join(origen, "package.json"), "utf8"));
const destino = join(raiz, "public", "pdfjs");

rmSync(destino, { recursive: true, force: true }); // borra las versiones anteriores
for (const carpeta of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
  const desde = join(origen, carpeta);
  if (existsSync(desde)) cpSync(desde, join(destino, version, carpeta), { recursive: true });
}
console.log(`pdf.js ${version}: recursos copiados a public/pdfjs/${version}/`);
