# Generador de Notas · Municipalidad de San Miguel de Tucumán

Redacción asistida por IA de notas administrativas: intimaciones, pedidos, notificaciones, pases, informes,
derivaciones, dictámenes básicos, solicitudes, respuestas y circulares. Dirección de Inteligencia Artificial.

## Qué lo diferencia del generador anterior

| | Generador anterior | Este |
|---|---|---|
| Modelo | `gpt-4o-mini` vía OpenRouter, temperatura 0,7 | Claude Opus 5.5 con razonamiento adaptativo (esfuerzo `high`) |
| Prompt | Plantilla genérica, igual para los 10 tipos | Prompt institucional con reglas legales, de estilo y una guía por tipo de nota |
| Datos que faltan | La IA los completa a su criterio | Los deja marcados `[[COMPLETAR: …]]` y los lista |
| Normas | Puede citarlas de memoria | Sólo las que da el usuario o el marco normativo cargado por el municipio |
| Género del destinatario | Una llamada extra a la IA para adivinarlo | Concordancia si es claro; fórmulas neutras si no |
| Salida | Texto libre que se limpia con expresiones regulares | JSON validado contra un esquema (cuerpo, faltantes, advertencias, normas) |
| Revisión | No | Panel de advertencias legales y de procedimiento antes de firmar |

## Qué hace

- **Formulario guiado** para los 10 tipos de nota.
- **Autocompletado con el padrón de funcionarios** (la misma API que usa el sistema anterior) en nombre, cargo y
  área del destinatario y de quien firma. Se busca por nombre, cargo o área, sin importar acentos ni títulos.
  Elegir una persona completa sus tres campos; elegir un área completa a su titular. Los cargos que vienen en
  forma doble («Director/a») se resuelven con un clic, y el correo del destinatario se propone al enviar.
- **«Contalo con tus palabras»:** se dicta por voz o se escribe de corrido y la IA completa el formulario
  (tipo, destinatario, quién firma, contenido, tono). La persona revisa y recién después redacta.
- **Micrófono en el campo principal** para dictar directo al texto, sin IA de por medio.
- **Estructura oficial de las notas de la Municipalidad** (la misma del generador anterior): fecha arriba a la
  derecha; destinatario en negrita (nombre, área y «De la Municipalidad de San Miguel de Tucumán»); número de nota
  y expediente si los hay; apertura «En mi carácter de…, me dirijo a usted a fin de…»; cierre «Sin otro
  particular, quedo a disposición y lo/la saludo atentamente.»; firma a la izquierda con «Cargo - Área». Sin línea
  de referencia. La IA escribe sólo el cuerpo y el cierre (y un asunto que se usa para el correo); el
  destinatario, la fecha, el expediente y la firma salen del formulario.
- **Prompt de sistema** en dos partes: la voz y el criterio de redacción definidos por la Dirección
  (`lib/ia/prompt-base.ts`, se edita libremente) y las instrucciones de funcionamiento de la aplicación
  (`lib/ia/prompt-sistema.ts`).
- **Datos para completar:** la IA marca sólo lo indispensable (un número de expediente, un plazo, una norma); lo
  demás lo redacta en forma general. Se completan tocando lo resaltado en la hoja, desde el panel o desde el aviso
  que aparece antes de exportar. En el Word, el PDF, el texto y el correo nunca sale el amarillo: lo que quede sin
  completar sale como una línea en blanco.
- **Redacción con razonamiento**, hoja A4 con membrete, panel de revisión (datos faltantes y riesgos legales),
  botón «Editar nota» arriba de la hoja y ajustes con IA («más breve», «agregá que…»).
- **Salida:** Word con membrete, PDF, imprimir, copiar, y correo (abre Gmail u otro programa con la nota en el cuerpo).
  Imprimir (y Ctrl+P) imprime el PDF de la nota, no la página: así no sale el encabezado ni el pie del navegador
  (fecha, título, dirección y número de hoja). El PDF, la impresión y el Word se ajustan para entrar en una hoja
  (se achican de a poco los espacios, el interlineado y la letra, hasta 10,5 pt); si ni así entra, salen en varias
  hojas a tamaño normal, con el cierre y la firma siempre juntos.

El dictado usa el reconocimiento de voz del navegador (Chrome y Edge; en Firefox no aparece). Esos navegadores
procesan el audio en servidores de Google o Microsoft: la interfaz lo avisa y sugiere escribir si hay datos sensibles.

Las claves de la IA viven sólo en el servidor (`.env.local`, fuera del repositorio): todas las llamadas a la IA
pasan por las rutas `/api/*` y ninguna clave llega al navegador.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y completar OPENROUTER_API_KEY (o ANTHROPIC_API_KEY)
npm run dev                  # http://localhost:3000
```

Prueba de punta a punta (con el servidor corriendo):

```bash
npm run probar:ia
```

Manda una intimación de ejemplo con un pedido de tono amenazante a propósito: la respuesta correcta es una
intimación firme y legal, con marcadores para la norma y una advertencia explicando el cambio.

## Variables de entorno

Alcanza con una de las dos claves. Si están las dos, se usa Anthropic directo salvo que `IA_PROVEEDOR` diga otra cosa.

| Variable | Por defecto | Para qué |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Clave de OpenRouter |
| `OPENROUTER_MODELO` | `anthropic/claude-opus-5.5` | Modelo en OpenRouter |
| `OPENROUTER_PERMITIR_RECOLECCION` | (no) | `1` para permitir proveedores que guardan los datos de los pedidos |
| `ANTHROPIC_API_KEY` | — | Clave de Anthropic directo |
| `IA_MODELO` | `claude-opus-5-5` | Modelo en Anthropic directo |
| `IA_PROVEEDOR` | `auto` | `anthropic`, `openrouter` o `auto` |
| `IA_ESFUERZO` | `high` | Profundidad de razonamiento: `low` … `max` |
| `FUNCIONARIOS_URL` | padrón de educacion.smt.gob.ar | Autocompletado de destinatarios |
| `LIMITE_GENERACIONES` | `20` | Notas por IP cada 10 minutos |

## Dónde está cada cosa

```
lib/ia/prompt-base.ts       El prompt base de la Dirección: voz y criterio de redacción
lib/ia/prompt-sistema.ts    Prompt base + cómo funciona la app: estructura, formato, datos a completar
lib/ia/guias-por-tipo.ts    Qué exige cada tipo de nota (elementos obligatorios, estructura, cuidados)
lib/ia/marco-normativo.ts   Normas que la IA puede citar (VACÍO: lo carga Asesoría Letrada)
lib/ia/esquema.ts           Esquema JSON que la API impone a la respuesta
lib/ia/extraccion.ts        Prompt y esquema para completar el formulario desde un dictado
lib/nota/dictado.ts         Dictado por voz (Web Speech API, es-AR)
lib/nota/padron.ts          Búsqueda del destinatario dictado en el padrón
app/api/extraer/route.ts    Endpoint de extracción de campos
lib/ia/generar.ts           Elige proveedor, valida la respuesta y traduce errores al castellano
lib/ia/via-openrouter.ts    Llamada por OpenRouter (streaming)
lib/ia/via-anthropic.ts     Llamada por Anthropic directo (SDK oficial, streaming)
app/api/generar/route.ts    Endpoint (Server-Sent Events) con límite por IP
app/api/funcionarios/       Padrón de funcionarios (sólo nombre, cargo y área)
components/                 Formulario, hoja A4, panel de revisión, progreso
lib/nota/docx.ts            Exportación a Word con membrete
lib/nota/pdf.ts             PDF de la nota (descargar e imprimir), ajustado a una hoja
```

El prompt de sistema no lleva la fecha ni datos variables: así la API lo guarda en caché y cada nota sale
más rápida y más barata. Todo lo que cambia entre notas va en el mensaje del usuario.

## Alcance

Herramienta de uso interno de la Dirección de IA: no tiene login, usuarios ni roles, a propósito. Si se
publica en una dirección accesible desde afuera de la red municipal, cualquiera que la conozca puede generar
notas con el crédito de la cuenta de IA; en ese caso conviene restringir el acceso (red interna o una clave
compartida).

## Pendientes

1. **Marco normativo.** `lib/ia/marco-normativo.ts` está vacío a propósito. Mientras siga así, la IA no cita
   ninguna norma que el usuario no haya escrito y deja marcadores. Asesoría Letrada debería cargar las
   ordenanzas y artículos de uso frecuente (higiene urbana, tránsito, habilitaciones, procedimiento).
2. **Pruebas de calidad.** Una tanda de 15 a 20 casos que cubra los 10 tipos, para ajustar el prompt y decidir
   modelo y esfuerzo con datos reales.
3. **Revisión de los textos por el área legal.** Las guías por tipo (`guias-por-tipo.ts`) son un punto de
   partida razonable; conviene que las valide quien conoce el procedimiento municipal.
4. **Posibles mejoras:** numeración automática de notas, historial local de las últimas notas.
