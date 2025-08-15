import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { history = [], caso, nivel } = body;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const system = `Eres un cliente realista que está interesado en comprar un coche, pero con dudas y objeciones. 
Tu papel es actuar de manera natural, como en una conversación real en un concesionario.

📌 Contexto del caso: ${caso || "SUV gasolina con dudas de consumo"}.
📌 Nivel de dificultad: ${nivel || "MEDIO"}.

Reglas:
- Responde de forma coherente con lo ya hablado.
- Utiliza un tono natural, con frases de distinta longitud, como si estuvieras pensando lo que dices.
- A veces incluye muletillas (“mmm”, “la verdad es que...”, “no sé, pero...”), expresiones coloquiales y pausas.
- Introduce objeciones reales según el caso y el nivel de dificultad.
- Si el vendedor responde bien a una objeción, cambia de tema o plantea una nueva inquietud relacionada.
- No des el cierre fácilmente; acepta una cita o un siguiente paso solo si el vendedor hace un cierre sólido y convincente.
- Mantén la personalidad del cliente consistente durante toda la interacción.
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
