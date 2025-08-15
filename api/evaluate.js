// /api/evaluate.js
import OpenAI from "openai";
import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // -------- leer body (transcript + car + nivel) --------
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { transcript = [], car = {}, nivel = "MEDIO" } = body;

    // -------- evaluar con OpenAI (texto breve + desglose) --------
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `Eres un formador comercial senior. Evalúa una conversación de venta de coches.
Devuelve un JSON con:
- nota_total (0 a 10, entero)
- desglose (objeto con: inicio, necesidades, propuesta, objeciones, cierre; 0-2 cada uno)
- fortalezas (array de 1-3 bullets cortos)
- mejoras (array de 2-4 bullets accionables)
- respuesta_modelo (un ejemplo de respuesta profesional, 1-2 frases)
Contesto SOLO con JSON válido.`;

    const convAsText = transcript
      .map(t => `${t.speaker === "vendedor" ? "Vendedor" : "Cliente"}: ${t.text}`)
      .join("\n");

    const prompt = `Nivel: ${nivel}
Coche: ${car?.title || "-"} ${car?.price ? `| ${car.price}` : ""} ${car?.monthly ? `| ${car.monthly}` : ""}

Transcripción:
${convAsText}`;

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    });

    const raw = r.choices?.[0]?.message?.content?.trim() || "{}";

    // A veces los modelos devuelven texto con  ```json ... ```  -> limpiamos
    const cleaned = raw
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();

    let evalObj;
    try {
      evalObj = JSON.parse(cleaned);
    } catch {
      // fallback ultra simple si viniera algo raro
      evalObj = {
        nota_total: 0,
        desglose: { inicio: 0, necesidades: 0, propuesta: 0, objeciones: 0, cierre: 0 },
        fortalezas: [],
        mejoras: ["No se pudo parsear la evaluación, revisar prompt."],
        respuesta_modelo: "Gracias por tu interés, ¿qué características valoras más para tu uso diario?"
      };
    }

    // -------- registrar en Google Sheets --------
    // Necesita: GSHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY
    const sheetsClient = await getSheetsClient();
    await appendRow(sheetsClient, process.env.GSHEET_ID, [
      new Date().toISOString(),                     // timestamp
      "-",                                          // email vendedor (lo añadiremos cuando activemos login)
      nivel,                                        // nivel
      car?.title || "",                             // título
      car?.price || "",                             // precio
      car?.monthly || "",                           // cuota
      evalObj?.nota_total ?? "",                    // nota
      safeJoin(evalObj?.fortalezas),                // fortalezas (texto)
      safeJoin(evalObj?.mejoras),                   // mejoras (texto)
      evalObj?.respuesta_modelo || "",              // respuesta modelo
      JSON.stringify(transcript).slice(0, 45000)    // transcripción (limitada para no superar celdas)
    ]);

    // -------- devolver texto bonito al frontend --------
    const printable = JSON.stringify(evalObj, null, 2);
    res.status(200).send(printable);

  } catch (e) {
    console.error("EVALUATE ERROR", e);
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}

// ========== helpers Google Sheets ==========

function safeJoin(arr) {
  if (!Array.isArray(arr)) return "";
  return arr.join(" • ");
}

async function getSheetsClient() {
  const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  // La clave llega con \n escapadas; hay que convertirlas a saltos reales
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  const jwt = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SCOPES
  });

  const sheets = google.sheets({ version: "v4", auth: jwt });
  return sheets;
}

async function appendRow(sheets, spreadsheetId, values) {
  // Crea la pestaña "Logs" si no existe y escribe en A:K
  // Cabeceras (solo la primera vez): Timestamp | Email | Nivel | Título | Precio | Cuota | Nota | Fortalezas | Mejoras | Respuesta Modelo | Transcript
  try {
    // Intento de append directo
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Logs!A:K",
      valueInputOption: "RAW",
      requestBody: { values: [values] }
    });
  } catch (err) {
    // Si la pestaña "Logs" no existe, la creamos y repetimos
    if (err?.errors?.[0]?.reason === "badRequest" || String(err).includes("Unable to parse range")) {
      // crear sheet Logs
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const exists = meta.data.sheets?.some(s => s.properties?.title === "Logs");
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              { addSheet: { properties: { title: "Logs" } } },
              {
                updateSheetProperties: {
                  properties: { title: "Logs", gridProperties: { frozenRowCount: 1 } },
                  fields: "gridProperties.frozenRowCount"
                }
              }
            ]
          }
        });
        // cabeceras
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: "Logs!A1:K1",
          valueInputOption: "RAW",
          requestBody: {
            values: [[
              "timestamp","email","nivel","titulo","precio","cuota","nota",
              "fortalezas","mejoras","respuesta_modelo","transcript"
            ]]
          }
        });
      }
      // reintentar append
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Logs!A:K",
        valueInputOption: "RAW",
        requestBody: { values: [values] }
      });
    } else {
      throw err;
    }
  }
}
