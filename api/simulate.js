import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EXCLUDE = [/eléctrico/i, /\bev\b/i, /tesla/i, /polestar/i];

async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Fetch ${url} -> ${r.status}`);
  return await r.text();
}

function parseDetail(html) {
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
  const locMatch =
    html.match(/situaci[oó]n\s*veh[^<]*<\/[^>]*>\s*([^<]+)/i) ||
    html.match(/situaci[oó]n[^<]*:\s*<\/[^>]*>\s*([^<]+)/i);
  const ubicacion = locMatch ? locMatch[1].replace(/\s+/g, " ").trim() : "";
  const fuelMatch = html.match(/Combustible:\s*([^<]+)/i);
  const descripcion = fuelMatch ? fuelMatch[1].replace(/\s+/g, " ").trim() : "vehículo de ocasión";

  let marca = "", modelo = "";
  if (title) {
    const parts = title.split(" ");
    marca = parts[0] || "";
    modelo = parts.slice(1).join(" ") || "";
  }
  return { marca, modelo, descripcion, ubicacion, titleRaw: title };
}

function bad(data) {
  const txt = [data.titleRaw, data.descripcion].join(" ");
  return EXCLUDE.some(rx => rx.test(txt));
}

async function pickCar() {
  const listTxt = await getText(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : ""}/stock.txt`)
                   .catch(()=>getText("https://"+process.env.VERCEL_URL+"/stock.txt")); // fallback
  const urls = listTxt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (!urls.length) throw new Error("stock.txt vacío");

  // intenta hasta 8 fichas por si alguna falla/filtro
  for (let i=0; i<8; i++) {
    const url = urls[Math.floor(Math.random()*urls.length)];
    try {
      const html = await getText(url);
      const det = parseDetail(html);
      if (!det.marca || bad(det)) continue;
      return { ...det, url };
    } catch { /* intenta otra */ }
  }
  throw new Error("No se pudo extraer un coche válido.");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { history = [], nivel = "MEDIO" } = body;

    const elegido = await pickCar();

    const system = `Eres un cliente realista interesado en un coche concreto de Crestanevada.
Responde natural y conciso (1–3 frases). Muletillas solo ocasionales (máx. 1 cada 3–4 turnos).
Si el vendedor responde bien, avanza; en ${nivel} no eternices objeciones.

📌 Coche: ${elegido.marca} ${elegido.modelo} (${elegido.descripcion}).
📌 Ubicación: ${elegido.ubicacion || "consultar en tienda"}.
📌 URL (contexto del auditor; no la menciones salvo que te la pidan): ${elegido.url}.

Reglas:
- Habla de ${elegido.marca} ${elegido.modelo} cuando sea natural.
- Objeciones posibles: consumo/etiqueta, mantenimiento/historial, financiación, disponibilidad en esta tienda, precio vs. alternativas.
- Si no está en esta tienda, pregunta por **traslado** para **ver/prueba** (plazo, condiciones).
- Acepta un **siguiente paso concreto** si el cierre del vendedor es convincente.
Formato: SOLO el mensaje del cliente.`;

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.65,
      max_tokens: 140,
      messages: [{ role: "system", content: system }, ...history]
    });

    const reply = r.choices?.[0]?.message?.content?.trim() || "Vale, ¿cómo lo podríamos ver?";
    return res.status(200).json({ reply, meta: { coche: elegido } });

  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
