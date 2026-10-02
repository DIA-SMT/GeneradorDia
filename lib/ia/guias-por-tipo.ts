import "server-only";
import type { TipoNotaId } from "@/lib/nota/tipos";

/**
 * Qué exige cada tipo de nota. Va dentro del prompt de sistema (y por eso
 * queda en caché): cambiar un texto acá cambia el comportamiento de la IA.
 *
 * Todas las notas comparten la estructura de la Municipalidad (apertura «En
 * mi carácter de…», desarrollo y cierre «Sin otro particular, quedo a
 * disposición…»), descripta en prompt-sistema.ts. Acá va sólo lo propio de
 * cada tipo.
 *
 * "obligatorios" son los elementos sin los cuales la nota no cumple su
 * función. Si el usuario no los dio, la IA deja un marcador [[COMPLETAR]]
 * y lo informa, en vez de inventarlos.
 */
type Guia = {
  nombre: string;
  proposito: string;
  obligatorios: string[];
  /** Qué va en el cuerpo, después de la apertura. */
  estructura: string;
  /** Último párrafo del cuerpo, antes del cierre de la Municipalidad (si el tipo lleva uno). */
  final: string;
  cuidado: string;
};

export const GUIAS: Record<TipoNotaId, Guia> = {
  intimacion: {
    nombre: "Intimación",
    proposito:
      "Exigir de modo formal y fehaciente el cumplimiento de una obligación concreta dentro de un plazo, haciendo saber la consecuencia de no cumplir.",
    obligatorios: [
      "Identificación del intimado (persona humana o jurídica, y el domicilio o inmueble cuando se trata de un vecino o comercio)",
      "Hecho u omisión que motiva la intimación, descripto con precisión (qué, dónde, cuándo se constató)",
      "Obligación que se exige cumplir",
      "Fundamento normativo que habilita a exigirla",
      "Plazo concreto, en letra y número, con su unidad (por ejemplo: diez (10) días hábiles administrativos) y desde cuándo corre",
      "Apercibimiento: la consecuencia jurídica de no cumplir, que debe estar prevista en la norma",
      "Dónde y cómo cumplir o presentar descargo",
    ],
    estructura:
      "Apertura: «En mi carácter de …, me dirijo a usted a fin de intimarlo a …» (o «intimarla», según el destinatario). Luego: hechos constatados; fundamento normativo; la intimación propiamente dicha (obligación + plazo); apercibimiento; forma de cumplimiento o de presentar descargo.",
    final: "«Queda usted debidamente notificado.» (concordado con el destinatario)",
    cuidado:
      "La firmeza sale del plazo y del apercibimiento, nunca de adjetivos. Prohibido amenazar con consecuencias que no estén previstas en una norma, imponer sanciones directamente (la intimación no sanciona: previene) o exponer a la persona. Si el usuario pide un tono agresivo, redactá firme y correcto y advertilo.",
  },
  pedido: {
    nombre: "Pedido",
    proposito:
      "Requerir a otra área bienes, servicios, información o una tarea concreta.",
    obligatorios: [
      "Qué se pide, con precisión (cantidades, especificaciones, alcance de la información)",
      "Para qué se necesita (la justificación hace que el pedido se priorice)",
      "Plazo o fecha en que se necesita, si existe",
    ],
    estructura:
      "Apertura con el objeto del pedido. Luego: detalle de lo pedido (usá 'item' si son varios elementos); justificación; plazo y persona de contacto si el usuario la dio.",
    final: "Ninguno.",
    cuidado:
      "No prometas partidas presupuestarias, compras ni contrataciones: un pedido no las compromete. Si el pedido implica gasto, advertí que puede requerir el procedimiento de contratación correspondiente.",
  },
  notificacion: {
    nombre: "Notificación",
    proposito:
      "Poner en conocimiento formal de alguien un acto administrativo, una decisión o un hecho que produce efectos para esa persona o área.",
    obligatorios: [
      "Acto o decisión que se notifica, con su identificación (tipo, número y fecha: decreto, resolución, disposición)",
      "Contenido esencial de lo decidido",
      "Efectos para el notificado y desde cuándo rigen",
      "Si el acto afecta derechos o intereses de un particular: recursos disponibles, plazo para interponerlos y ante quién",
    ],
    estructura:
      "Apertura: «… me dirijo a usted a fin de notificarle …» el acto, identificado. Luego: transcripción o síntesis fiel de la parte dispositiva; efectos y fechas; recursos y plazos (cuando corresponda); copia adjunta, si el usuario la menciona.",
    final: "«Queda usted debidamente notificado.» (concordado con el destinatario)",
    cuidado:
      "Una notificación que omite los recursos disponibles contra un acto que afecta derechos puede ser defectuosa: si falta ese dato, marcador y advertencia de nivel alta. No parafrasees la parte dispositiva de forma que cambie su sentido.",
  },
  pase: {
    nombre: "Pase",
    proposito:
      "Remitir actuaciones o un expediente a otra área para que intervenga, dictamine, tome conocimiento o continúe el trámite.",
    obligatorios: [
      "Área de destino",
      "Qué intervención se le pide (informe, dictamen, toma de conocimiento, continuidad del trámite)",
    ],
    estructura:
      "Muy breve: la apertura ya dice qué se remite y para qué («… me dirijo a usted a fin de remitir las presentes actuaciones para que tome intervención y emita el informe correspondiente»). Si el usuario indica fojas o documentación agregada, una oración más.",
    final: "Ninguno.",
    cuidado: "No adornes: un pase largo es un pase mal hecho.",
  },
  informe: {
    nombre: "Informe",
    proposito:
      "Exponer hechos verificados, analizarlos y extraer conclusiones o recomendaciones para quien debe decidir.",
    obligatorios: [
      "Objeto del informe (qué se informa y a pedido de quién, si corresponde)",
      "Hechos o datos relevados, con su fuente",
      "Conclusión clara",
    ],
    estructura:
      "Apertura con el objeto del informe. Luego, secciones con títulos en mayúsculas numerados en romanos, como bloques 'titulo': I. ANTECEDENTES. II. SITUACIÓN ACTUAL (o RELEVAMIENTO). III. ANÁLISIS. IV. CONCLUSIONES Y RECOMENDACIONES. En la versión breve se pueden fusionar secciones.",
    final: "Opcional: «Es todo cuanto puedo informar.»",
    cuidado:
      "Separá estrictamente hechos de opiniones. Ningún dato numérico, porcentaje o fecha que no venga del usuario. Las recomendaciones deben ser accionables y estar dentro de la competencia de quien recibe el informe.",
  },
  derivacion: {
    nombre: "Derivación",
    proposito:
      "Enviar un asunto, reclamo o presentación al área que resulta competente por razón de la materia, para que lo resuelva.",
    obligatorios: [
      "Asunto o presentación que se deriva, identificado",
      "Área a la que se deriva",
      "Razón por la que esa área es la competente",
    ],
    estructura:
      "Apertura: «… me dirijo a usted a fin de derivar …» el asunto, identificado. Luego: breve síntesis del asunto; por qué corresponde a esa área; pedido de que se dé respuesta al interesado y, si el usuario lo indica, que se informe lo actuado.",
    final: "Ninguno.",
    cuidado:
      "Derivar no es desentenderse: si hay un vecino esperando respuesta, decilo. No afirmes la competencia del área destino con un número de norma inventado.",
  },
  dictamen: {
    nombre: "Dictamen básico",
    proposito:
      "Emitir una opinión técnica o jurídica fundada, no vinculante, sobre una cuestión planteada, para orientar a la autoridad que decide.",
    obligatorios: [
      "Cuestión sobre la que se dictamina y quién la consulta",
      "Antecedentes relevantes",
      "Normativa aplicable (sólo la provista o la del marco de referencia)",
      "Conclusión expresa y concreta",
    ],
    estructura:
      "Apertura: «… me dirijo a usted a fin de emitir dictamen sobre …». Luego, bloques 'titulo': I. ANTECEDENTES. II. CUESTIÓN PLANTEADA. III. ANÁLISIS (normativa aplicable y consideraciones). IV. CONCLUSIÓN. La conclusión empieza por «Por lo expuesto, esta [área] entiende que…» y es concreta (qué corresponde hacer).",
    final: "«Es mi dictamen, salvo mejor criterio de la superioridad.»",
    cuidado:
      "Es el tipo con más riesgo de invención: cero jurisprudencia, cero doctrina, cero artículos que no estén en los datos o en el marco de referencia. Si el análisis depende de una norma que no tenés, marcador y advertencia alta. Si los datos no alcanzan para concluir, decilo en la conclusión en lugar de forzarla.",
  },
  solicitud: {
    nombre: "Solicitud",
    proposito:
      "Pedir a una autoridad superior una autorización, aprobación, licencia, recurso o intervención que depende de su decisión.",
    obligatorios: [
      "Qué se solicita exactamente",
      "Fundamento o justificación",
      "Plazo o fecha, si lo hay",
    ],
    estructura:
      "Apertura: «… me dirijo a usted a fin de solicitar …». Luego: fundamentos; detalle operativo si hace falta (fechas, montos, cantidades que dio el usuario).",
    final: "Ninguno.",
    cuidado:
      "Deferencia sin servilismo. Nada de «humildemente», «me permito molestarlo» ni ruegos.",
  },
  respuesta: {
    nombre: "Respuesta",
    proposito:
      "Contestar una nota, pedido o presentación recibida.",
    obligatorios: [
      "Identificación de lo que se responde (número de nota o expediente y fecha de la presentación)",
      "Respuesta a cada punto planteado",
    ],
    estructura:
      "Apertura: «… me dirijo a usted a fin de responder …» la nota o presentación identificada. Luego: respuesta punto por punto, en el mismo orden en que fueron planteados (usá 'item' si son varios); próximos pasos o área de contacto, si el usuario la dio.",
    final: "Ninguno.",
    cuidado:
      "Si te pasan la nota original en los antecedentes, no dejes ningún punto sin responder; si un punto no puede responderse con los datos dados, marcador. No asumas compromisos que el usuario no autorizó.",
  },
  circular: {
    nombre: "Circular",
    proposito:
      "Impartir una instrucción o comunicar una disposición de alcance general a varias áreas o agentes.",
    obligatorios: [
      "Destinatarios (alcance: qué áreas o agentes)",
      "Qué se instruye o comunica",
      "Desde cuándo rige",
    ],
    estructura:
      "Apertura en plural: «… me dirijo a ustedes a fin de …». Luego: qué se instruye y por qué; instrucciones concretas (usá 'item'); vigencia; a quién consultar. Cierre en plural: «… saludo a ustedes atentamente.»",
    final: "Ninguno.",
    cuidado:
      "Instrucciones verificables y sin ambigüedad. Una circular no puede modificar normas ni crear obligaciones que exceden la competencia de quien la firma: si el contenido lo sugiere, advertencia alta.",
  },
};

/** Las guías en el formato en que entran al prompt de sistema. */
export function guiasParaPrompt(): string {
  return Object.entries(GUIAS)
    .map(([id, g]) => {
      const obligatorios = g.obligatorios.map((o) => `   - ${o}`).join("\n");
      return [
        `<tipo id="${id}" nombre="${g.nombre}">`,
        `Propósito: ${g.proposito}`,
        `Elementos obligatorios:\n${obligatorios}`,
        `Cuerpo: ${g.estructura}`,
        `Último párrafo del cuerpo: ${g.final}`,
        `Cuidado: ${g.cuidado}`,
        `</tipo>`,
      ].join("\n");
    })
    .join("\n\n");
}
