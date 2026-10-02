/**
 * Prueba de punta a punta contra el servidor local: manda una intimación de
 * ejemplo a /api/generar y muestra lo que devuelve la IA.
 *
 * Uso (con `npm run dev` corriendo y ANTHROPIC_API_KEY en .env.local):
 *   npm run probar:ia
 *   npm run probar:ia -- http://otro-servidor:3000
 */

export {};

const base = process.argv[2] ?? "http://localhost:3000";

const pedido = {
  datos: {
    tipo: "intimacion",
    ambito: "externo",
    fecha: new Date().toISOString().slice(0, 10),
    numeroNota: "",
    expediente: "",
    destinatarioNombre: "Propietario del inmueble",
    destinatarioCargo: "",
    destinatarioArea: "Calle Las Heras 1200, San Miguel de Tucumán",
    remitenteNombre: "Lic. María Gómez",
    remitenteCargo: "Directora",
    remitenteArea: "Dirección de Fiscalización",
    motivo:
      "Intimar al propietario a desmalezar y limpiar el terreno baldío. La inspección lo constató el 20 de septiembre: " +
      "pastizales de más de un metro y acumulación de residuos. Plazo de 10 días hábiles. Si no cumple, " +
      "decile que le vamos a cobrar todo y que se va a arrepentir.",
    antecedentes: "",
    tono: "firme",
    extension: "estandar",
  },
};

const inicio = Date.now();
const r = await fetch(`${base}/api/generar`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(pedido),
});

if (!r.ok || !r.body) {
  console.error(`HTTP ${r.status}:`, await r.text());
  process.exit(1);
}

let resto = "";
let razonamiento = 0;
const decoder = new TextDecoder();
for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
  resto += decoder.decode(chunk, { stream: true });
  const bloques = resto.split("\n\n");
  resto = bloques.pop() ?? "";
  for (const b of bloques) {
    if (!b.startsWith("data: ")) continue;
    const ev = JSON.parse(b.slice(6));
    if (ev.tipo === "fase") console.log(`· ${ev.fase} (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
    else if (ev.tipo === "razonamiento") razonamiento += ev.texto.length;
    else if (ev.tipo === "error") {
      console.error("ERROR:", ev.mensaje);
      process.exit(1);
    } else if (ev.tipo === "resultado") {
      const n = ev.nota;
      console.log(`\nModelo: ${ev.modelo} · ${((Date.now() - inicio) / 1000).toFixed(1)} s · razonamiento resumido: ${razonamiento} caracteres\n`);
      console.log(`[destinatario: lo arma el sistema con los datos del formulario]\n`);
      console.log(`Referencia: ${n.referencia}\n`);
      for (const c of n.cuerpo) console.log((c.tipo === "item" ? "  - " : "") + c.texto + "\n");
      if (n.cierre) console.log(n.cierre);
      console.log("\nFALTANTES:", JSON.stringify(n.faltantes, null, 2));
      console.log("ADVERTENCIAS:", JSON.stringify(n.advertencias, null, 2));
      console.log("NORMAS:", JSON.stringify(n.normas_citadas, null, 2));
    }
  }
}
