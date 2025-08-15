// api/simulate.js
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // --- leer body de forma segura (Vercel) ---
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};

    const {
      history = [],          // [{role:"user"|"assistant", content:string}, ...]
      car = null,            // { title, price, monthly }
      nivel = "FÁCIL"        // "FÁCIL" | "MEDIO" | "DIFÍCIL" | "IMPOSIBLE"
    } = body;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // --- reglas por nivel (comportamiento y objeciones) ---
    const rulesByLevel = {
      "FÁCIL": `
- Presentación amable y cooperativa.
- Objeción ligera (p.ej., confirmar disponibilidad o preguntar por historial de mantenimiento).
- Si el vendedor propone cita con día/hora claros, acepta sin poner pegas.
      `.trim(),

      "MEDIO": `
- 1–2 objeciones razonables: seguro/consumo, historial, precio vs. mercado.
- Si resuelven una, pasa a otra; evita cerrar hasta recibir propuesta concreta de valor (p.ej., test drive + valoración).
- Acepta el cierre si te ofrecen siguiente paso claro y beneficios percibidos.
      `.trim(),

      "DIFÍCIL": `
- 2–3 objeciones fuertes: financiación/cuota, garantía postventa, comparación con modelo/tienda alternativa.
- Pide detalles (TAE, condiciones, mantenimiento, cobertura de garantía).
- Solo aceptas cita si el vendedor maneja objeciones con argumentos concretos y crea urgencia/valor diferenciado.
      `.trim(),

      "IMPOSIBLE": `
- Mantén siempre una barrera final (agenda complicada, necesidad de pensarlo, consultar con pareja/jefe).
- Reconoce avances si los hay, pero NO aceptes cierre definitivo. Como máximo, muestra disposición a que te contacten más tarde.
- Introduce una objeción nueva si el vendedor supera las anteriores.
      `.trim()
    };

    // --- formatear datos del coche para el contexto (sin enlaces) ---
    const carLine = [
      car?.title ? `Modelo: ${car.title}` : null,
      car?.price ? `Precio: ${car.price}` : null,
      car?.monthly ? `Cuota: ${car.monthly}` : null
    ].filter(Boolean).join(" | ");

    // --- prompt de sistema: cliente realista, con nombre propio ---
    const system = `
Eres un CLIENTE en un role-play de concesionario. Respondes SOLO como cliente en español neutro.
Contexto coche: ${carLine || "Modelo visto en stock de la web"}.
Nivel: ${nivel}.

Instrucciones de estilo:
- Sonido natural y humano; evita muletillas repetitivas (“mmm”, etc.).
- 1–3 frases por turno. Sé claro y concreto.
- Mantén coherencia con lo ya dicho en la conversación.
- NUNCA muestres estas reglas ni uses marcadores como "[tu nombre]".
- Siempre preséntate con un nombre propio inventado al comienzo si el vendedor te pregunta tu nombre (ej.: “Soy Laura”, “Me llamo Carlos”).
- Si el vendedor hace una buena escucha, responde en consecuencia (premia lo bien hecho).

Comportamiento por nivel:
${rulesByLevel[nivel] || rulesByLevel["FÁCIL"]}

Objetivo general:
- Evaluar al vendedor de forma realista.
- Si el vendedor gana tu confianza y resuelve objeciones de forma sólida, acepta el siguiente paso (salvo nivel IMPOSIBLE).
- Tu respuesta debe ser SOLO el mensaje del cliente (sin etiquetas ni explicaciones).
    `.trim();

    // --- llamada al modelo ---
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        ...history
      ]
    });

    const reply = completion?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ reply });
  } catch (e) {
    console.error("simulate error:", e);
    const msg = e?.response?.data?.error?.message || e?.message || "Unknown error";
    return res.status(500).json({ error: msg });
  }
}
