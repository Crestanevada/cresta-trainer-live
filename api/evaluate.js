import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};

    const { transcript = [], car = {}, nivel = "MEDIO", user_email = "desconocido@crestanevada.es" } = body;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `Eres un EVALUADOR de role plays de venta de VO. Puntúas 0–10 y das feedback accionable.`;

    const user = {
      role: "user",
      content: JSON.stringify({
        user_email,
        nivel,
        car,
        transcript
      })
    };

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        {
          role: "system",
          content:
`INSTRUCCIONES DE SALIDA:
- Devuelve PRIMERO una línea: "Usuario: <email> | Nivel: <nivel> | Nota: <x.x>/10"
- Luego "Resumen:" (3–6 líneas).
- Luego "Fortalezas:" (3 viñetas).
- Luego "Oportunidades:" (3 viñetas).
- Luego "Siguientes acciones (3–5):" (lista).
- Finalmente, "Criterios (0–10): necesidad, argumentario, objeciones, siguiente_paso, claridad, cierre".
- Mantén todo en texto plano (sin JSON).`
        },
        user
      ]
    });

    const text = r.choices?.[0]?.message?.content || "No se pudo generar la evaluación.";
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(text);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
