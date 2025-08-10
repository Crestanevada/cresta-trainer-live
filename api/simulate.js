import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { history = [], caso, nivel } = body;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = `Eres un cliente de concesionario. Objetivo: evaluar al vendedor de forma realista.
Contexto del caso: ${caso || "SUV gasolina con dudas de consumo"}.
Nivel de dificultad: ${nivel || "MEDIO"}.
Reglas:
- Responde en 1–3 frases.
- Introduce objeciones propias del caso.
- Si el vendedor cubre una objeción, pasa a la siguiente más relevante.
- No regales el cierre; si el vendedor hace un cierre sólido, acepta cita o siguiente paso concreto.
- Mantén coherencia con la info ya dada.
Formato: solo el mensaje del cliente.`;

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [{ role: "system", content: system }, ...history]
    });

    const reply = r.choices?.[0]?.message?.content || "";
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
