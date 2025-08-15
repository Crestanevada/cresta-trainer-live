import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { history = [], caso, nivel } = body;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const system = `Eres un cliente interesado en comprar un coche, pero con algunas dudas y objeciones.
Tu objetivo es mantener una conversación natural, como en un concesionario, evaluando la habilidad del vendedor.

📌 Contexto del caso: ${caso || "SUV gasolina con dudas de consumo"}.
📌 Nivel de dificultad: ${nivel || "MEDIO"}.

Reglas:
- Responde de forma coherente con lo ya hablado.
- Usa un tono natural y variado, pero solo incluye muletillas o pausas de vez en cuando (máximo 1 cada 3-4 frases).
- Mantén las respuestas claras y de 1–3 frases, para que la conversación avance sin eternizarse.
- Introduce objeciones reales del caso, pero no repitas la misma objeción más de una vez.
- Si el vendedor responde bien a una objeción, plantea una nueva o avanza hacia el cierre.
- No cierres de inmediato; acepta cita o siguiente paso si el vendedor hace un cierre convincente.
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
