import "server-only";

/**
 * Esquema JSON que la API le impone a la respuesta (structured outputs).
 * Tiene que coincidir con NotaGeneradaSchema de lib/nota/tipos.ts, que es
 * con el que validamos lo que vuelve.
 *
 * La IA escribe sólo la referencia, el cuerpo y el cierre: el membrete, la
 * fecha, el bloque del destinatario, el número, el expediente y la firma los
 * arma el sistema con los datos del formulario.
 *
 * Las descripciones las lee el modelo: son parte de las instrucciones.
 */
export const ESQUEMA_NOTA = {
  type: "object",
  additionalProperties: false,
  required: ["referencia", "cuerpo", "cierre", "faltantes", "advertencias", "normas_citadas"],
  properties: {
    referencia: {
      type: "string",
      description:
        "Asunto de la nota en una línea, para el asunto del correo y el título del archivo (no se imprime en la nota). Sin el prefijo 'Referencia:' ni marcadores. Sustantivo + objeto concreto, hasta 15 palabras.",
    },
    cuerpo: {
      type: "array",
      description:
        "Cuerpo de la nota en bloques, en orden. El primero es un 'parrafo' que empieza con la fórmula de apertura («En mi carácter de …, me dirijo a usted a fin de …»). 'titulo' sólo para secciones de informes y dictámenes; 'item' para enumeraciones.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "texto"],
        properties: {
          tipo: { type: "string", enum: ["parrafo", "titulo", "item"] },
          texto: { type: "string" },
        },
      },
    },
    cierre: {
      type: "string",
      description:
        "La fórmula de cierre de la Municipalidad («Sin otro particular, quedo a disposición y …»), con el saludo que corresponde al destinatario.",
    },
    faltantes: {
      type: "array",
      description: "Un elemento por cada marcador [[COMPLETAR: ...]] que dejaste en el texto.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dato", "motivo"],
        properties: {
          dato: { type: "string", description: "Qué dato falta, igual que en el marcador." },
          motivo: { type: "string", description: "Por qué la nota lo necesita, en una oración." },
        },
      },
    },
    advertencias: {
      type: "array",
      description:
        "Riesgos concretos que el firmante debe revisar antes de firmar. Lista vacía si no hay ninguno real.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nivel", "texto"],
        properties: {
          nivel: { type: "string", enum: ["alta", "media", "baja"] },
          texto: { type: "string" },
        },
      },
    },
    normas_citadas: {
      type: "array",
      description: "Cada norma mencionada en la nota, con su origen.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["norma", "origen"],
        properties: {
          norma: { type: "string" },
          origen: { type: "string", enum: ["datos_del_usuario", "marco_de_referencia"] },
        },
      },
    },
  },
} as const;
