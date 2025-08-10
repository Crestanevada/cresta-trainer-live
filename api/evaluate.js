import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { transcript = [] } = body;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `Eres auditor de ventas. Evalúa la transcripción (turnos cliente/vendedor) según esta rúbrica (0–2 cada ítem):
1) Inicio y rapport
2) Detección de necesidades
3) Propuesta de valor adaptada
4) Manejo de objeciones
5) Cierre (siguiente paso claro)

Devuelve JSON con:
{
 "nota_total": 0-10,
 "desglose": {"inicio":0-2,"necesidades":0-2,"propuesta":0-2,"objeciones":0-2,"cierre":0-2},
 "fortalezas": ["..."],
 "mejoras": ["..."],
 "respuesta_modelo": "3-5 frases de ejemplo óptimo"
}
No añadas texto fuera del JSON.`;

    const user = "TRANSCRIPCIÓN:\n" + transcript.map(t => `${t.speaker.toUpperCase()}: ${t.text}`).join("\n");

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const json = r.choices?.[0]?.message?.content || "{}";
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(json);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
