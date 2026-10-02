// Las fuentes estándar del PDF que trae pdfmake (Times, Helvetica…): cada archivo exporta su contenedor.
declare module "pdfmake/build/standard-fonts/*" {
  import type { TFontContainer } from "pdfmake/interfaces";
  const contenedor: TFontContainer;
  export default contenedor;
}
