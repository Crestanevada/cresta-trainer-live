import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};

    const { history = [], car = {}, nivel = "MEDIO", user_email = "desconocido@crestanevada.es" } = body;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `Eres un CLIENTE de concesionario en un role play comercial. Hablas natural (1–3 frases), sin muletillas repetitivas. 
Usuario: ${user_email}
Nivel: ${nivel}
Vehículo (si aplica): ${car?.title || "no especificado"} ${car?.price ? "• " + car.price : ""} ${car?.monthly ? "• " + car.monthly : ""}

Reglas:
- Prioriza objeciones razonables (consumo, financiación, garantía, mantenimiento, disponibilidad, prueba, tasación).
- Si el vendedor resuelve una objeción, cambia a la siguiente relevante.
- No regales el cierre; acepta siguiente paso solo si es concreto (cita/fecha/hora/tienda).
- Sé coherente con el historial.

Responde solo con el mensaje del cliente.`;

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [{ role: "system", content: system }, ...history]
    });

    const reply = r.choices?.[0]?.message?.content || "";
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
