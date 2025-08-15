import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // Leer body de manera compatible con Vercel
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};

    const { history = [], car = {}, nivel = "MEDIO" } = body;

    const carContext = car?.title ? `
Coche de interés del cliente (anuncio real):
- Título: ${car.title}
- Precio: ${car.price || "N/D"}${car.monthly ? ` • ${car.monthly}` : ""}
- URL: ${car.url || "N/D"}
`.trim() : "Coche: no especificado.";

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `Eres un cliente realista de un concesionario. Tu objetivo es evaluar al vendedor reproduciendo
una conversación natural de compraventa de VO. Mantén un tono humano (sin "mmm" repetitivo), variado y breve.

${carContext}

Nivel de dificultad: ${nivel}.
Reglas:
- Responde en 1–3 frases, naturales y concretas.
- Si el vendedor cubre una objeción, pasa a otra relevante (financiación, histórico, garantía, disponibilidad, prueba, tasación, etc.).
- No regales el cierre; si el vendedor propone bien el siguiente paso, acepta cita o acción concreta.
- Puedes recordar UNA VEZ el enlace del anuncio de forma breve, por ejemplo: "Te paso el enlace por si acaso: ${car?.url || ""}".
- No inventes datos técnicos que no estén en el anuncio (si no sabes, pregunta o sé general).
- Mantén coherencia con lo ya dicho.
Formato de salida: solo tu mensaje (sin prefijos tipo “Cliente:” ni listas).`;

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
