import OpenAI from "openai";

// --------- utilidades scraping simples ---------
const LIST_URL = "https://www.crestanevada.es/coches-segunda-mano";
const EXCLUDE_BRANDS = [/tesla/i, /polestar/i];
const EXCLUDE_WORDS = [/eléctrico/i, /\bev\b/i, /electric\b/i];

async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Fetch ${url} -> ${r.status}`);
  return await r.text();
}

// extrae pares {url, titulo} de la lista
function parseList(html) {
  const items = [];
  const re = /<a\s+[^>]*href="(https:\/\/www\.crestanevada\.es\/coches-segunda-mano\/[^"]+)"[^>]*>(.*?)<\/a>/gims;
  let m;
  while ((m = re.exec(html)) && items.length < 60) {
    const url = m[1];
    const raw = m[2].replace(/\s+/g, " ").trim();
    // filtramos solo tarjetas que parecen vehículo (tienen precio o CV/kms en el bloque)
    if (/€|\bkm\b|CV\b/i.test(raw)) items.push({ url, title: raw });
  }
  // quitar eléctricos y marcas excluidas
  return items.filter(({ title, url }) => {
    if (EXCLUDE_WORDS.some(rx => rx.test(title))) return false;
    if (EXCLUDE_BRANDS.some(rx => rx.test(title))) return false;
    return true;
  });
}

// desde una ficha, sacar H1 (marca+modelo) y "situación veh ..."
function parseDetail(html) {
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

  // “situación veh …” aparece cerca de iconos (puede variar, así que usamos regex flexible)
  const locMatch =
    html.match(/situaci[oó]n\s*veh[^<]*<\/[^>]*>\s*([^<]+)/i) ||
    html.match(/situaci[oó]n[^<]*:\s*<\/[^>]*>\s*([^<]+)/i);
  const ubicacion = locMatch ? locMatch[1].replace(/\s+/g, " ").trim() : "";

  // Combustible/descr (intento rápido)
  const fuelMatch = html.match(/Combustible:\s*([^<]+)/i);
  const descripcion = fuelMatch ? fuelMatch[1].replace(/\s+/g, " ").trim() : "vehículo de ocasión";

  // dividir marca y modelo aproximando con la primera palabra como marca
  let marca = "";
  let modelo = "";
  if (title) {
    const parts = title.split(" ");
    marca = parts[0] || "";
    modelo = parts.slice(1).join(" ") || "";
  }
  return { marca, modelo, descripcion, ubicacion, titleRaw: title };
}

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// fallback no eléctricos
const FALLBACK_CASOS = [
  { marca: "Toyota", modelo: "RAV4", descripcion: "SUV gasolina", ubicacion: "Granada", preferencia: "Suele gustarme Toyota" },
  { marca: "BMW", modelo: "X5", descripcion: "SUV diésel", ubicacion: "Madrid", preferencia: "Me tira BMW" },
  { marca: "Audi", modelo: "A4", descripcion: "berlina gasolina", ubicacion: "Sevilla", preferencia: "Suelo mirar Audi" },
  { marca: "Volkswagen", modelo: "Tiguan", descripcion: "SUV gasolina", ubicacion: "Málaga", preferencia: "VW me inspira confianza" },
  { marca: "Hyundai", modelo: "Tucson", descripcion: "híbrido no enchufable", ubicacion: "Valencia", preferencia: "Hyundai me parece buena opción" }
];

// --------- handler principal ---------
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // leer body en Vercel de forma segura
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { history = [], nivel = "MEDIO" } = body;

    // 1) intentar obtener una ficha real aleatoria
    let elegido = null;
    try {
      const listHtml = await getText(LIST_URL);
      const list = parseList(listHtml);
      const pick = randomOf(list);
      if (!pick) throw new Error("No se encontraron coches válidos");

      const detHtml = await getText(pick.url);
      const det = parseDetail(detHtml);

      // descartar si parece eléctrico o marca excluida
      const guardOK =
        det.marca &&
        !EXCLUDE_BRANDS.some(rx => rx.test(det.marca)) &&
        !EXCLUDE_WORDS.some(rx => rx.test(det.titleRaw || "")) &&
        !EXCLUDE_WORDS.some(rx => rx.test(det.descripcion || ""));

      if (!guardOK) throw new Error("Coche excluido por filtros");
      elegido = {
        marca: det.marca || "Crestanevada",
        modelo: det.modelo || "vehículo",
        descripcion: det.descripcion || "vehículo de ocasión",
        ubicacion: det.ubicacion || "Consulta en tienda",
        preferencia: `Normalmente miro ${det.marca || "esta marca"} antes que otras`,
        url: pick.url
      };
    } catch {
      // 2) fallback
      elegido = randomOf(FALLBACK_CASOS);
    }

    // 3) prompt más humano (muletillas ocasionales, no repetitivas) y con traslado entre tiendas
    const system = `Eres un cliente realista interesado en un coche concreto de Crestanevada.
Responde con naturalidad y en 1–3 frases. Usa muletillas SOLO de forma ocasional (máx. 1 cada 3–4 turnos).
No repitas la misma objeción. En nivel ${nivel}, si el vendedor argumenta bien, avanza.
Habla del coche concreto y tu preferencia de marca.

📌 Coche: ${elegido.marca} ${elegido.modelo} (${elegido.descripcion}).
📌 Ubicación actual (si la sabes): ${elegido.ubicacion}.
📌 Preferencia de marca: ${elegido.preferencia}.
📌 Enlace (interno para contexto del auditor, no lo menciones si no te lo piden): ${elegido.url || "n/a"}.

Reglas de comportamiento:
- Menciona ${elegido.marca} ${elegido.modelo} cuando sea natural.
- Objeciones posibles: consumo/etiqueta, historial/mantenimiento, financiación, disponibilidad en esta tienda, precio vs. alternativas de la misma marca.
- Si el vendedor indica que el coche no está en esta tienda, pregunta si pueden **trasladarlo** a tu tienda para **verlo y probarlo** (términos: plazo, señal, condiciones).
- Si el cierre del vendedor es convincente, acepta un **siguiente paso concreto** (cita, prueba, reserva).
Formato: SOLO el mensaje del cliente (sin etiquetas, ni listas).`;

    const messages = [{ role: "system", content: system }, ...history];

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.65,          // natural, menos verborrea
      max_tokens: 140,
      messages
    });

    const reply = r.choices?.[0]?.message?.content?.trim() || "Vale, ¿cómo podríamos verlo?";
    return res.status(200).json({ reply, meta: { coche: elegido } });

  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
