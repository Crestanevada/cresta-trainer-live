// /api/simulate.js
import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { history = [], car = {}, nivel = "FÁCIL" } = body;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const rulesByLevel = {
      "FÁCIL": `
- Objeciones suaves: dudas de consumo, seguro, disponibilidad.
- Acepta cita si el vendedor hace una propuesta clara.
- 1–2 frases por turno, tono amable, sin muletillas.
`,
      "MEDIO": `
- Introduce 2–3 objeciones: financiación, historial, garantía.
- Compara con otra marca similar, pide alternativas.
- Solo aceptas cita si el vendedor cierra con un siguiente paso concreto (día/hora) y te da valor (p.ej. prueba de conducción).
- 1–3 frases, directo.
`,
      "DIFÍCIL": `
- Objeciones más duras: tasación de coche a cambio, letra mensual tope, desconfianza por mantenimiento.
- Si el vendedor no re-capitula necesidades y propone algo muy concreto, no avances.
- Pide documentos (libro mantenimiento, historial), compara con oferta de otro concesionario.
- Sé escueto: 1–3 frases, no regales el cierre.
`,
      "IMPOSIBLE": `
- Nunca aceptes cerrar cita hoy; como máximo acepta "valorar volver a hablar".
- Rotar objeciones: presupuesto inflexible, preferencia por otra marca, distancia, decisión compartida con pareja.
- Aunque el vendedor lo haga bien, mantén una barrera externa (agenda llena, viaje, etc.).
- 1–2 frases, firme pero educado.
`
    };

    const system = `
Eres un cliente de concesionario. Respondes SOLO como cliente.
Coche: ${car?.title || "modelo en stock"} ${car?.price ? "| " + car.price : ""} ${car?.monthly ? "| " + car.monthly : ""}.
Nivel: ${nivel}.
Reglas generales:
- 1–3 frases por turno (máximo).
- Mantén coherencia: si diste un dato, no lo contradigas.
- Si el vendedor resuelve una objeción, pasa a la siguiente más relevante.
- ${rulesByLevel[nivel] || rulesByLevel["FÁCIL"]}
`.trim();

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [{ role: "system", content: system }, ...history]
    });

    const reply = r.choices?.[0]?.message?.content || "Ok.";
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
