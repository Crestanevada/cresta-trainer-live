// /api/evaluate.js
import OpenAI from "openai";
import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // leer body
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { transcript = [], car = {}, nivel = "FÁCIL", sellerEmail = "-" } = body;

    // 1) Evaluación
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const sysEval = `Eres evaluador de ventas en automoción. Devuelve SOLO JSON válido:
{
 "nota_total": number (0-10, entero),
 "desglose": { "inicio":0-2,"necesidades":0-2,"propuesta":0-2,"objeciones":0-2,"cierre":0-2 },
 "fortalezas": string[],
 "mejoras": string[],
 "respuesta_modelo": string
}
Valora según el nivel indicado y la calidad de preguntas, gestión de objeciones y siguiente paso.`;

    const convStr = transcript.map(t => `${t.speaker === "vendedor" ? "VENDEDOR" : "CLIENTE"}: ${t.text}`).join("\n");
    const userEval = `Nivel: ${nivel}
Coche: ${car?.title || ""} ${car?.price || ""} ${car?.monthly || ""}
Transcripción:
${convStr}`;

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "system", content: sysEval }, { role: "user", content: userEval }]
    });

    let raw = r.choices?.[0]?.message?.content?.trim() || "{}";
    const m = raw.match(/\{[\s\S]*\}$/); if (m) raw = m[0];

    let result;
    try { result = JSON.parse(raw); }
    catch { result = { nota_total: 0, desglose:{inicio:0,necesidades:0,propuesta:0,objeciones:0,cierre:0}, fortalezas:[], mejoras:[], respuesta_modelo:"" }; }

    // 2) Append en Google Sheets (Logs)
    try {
      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      const sheets = google.sheets({ version: 'v4', auth });

      const values = [[
        new Date().toISOString(),           // A timestamp
        sellerEmail,                        // B email
        nivel,                              // C nivel
        car?.title || "",                   // D título
        car?.price || "",                   // E precio
        car?.monthly || "",                 // F cuota
        Number(result?.nota_total ?? 0),    // G nota
        (result?.fortalezas||[]).join(" | "), // H fortalezas
        (result?.mejoras||[]).join(" | "),    // I mejoras
        (result?.respuesta_modelo||""),       // J respuesta_modelo
        JSON.stringify(transcript).slice(0, 45000) // K transcript
      ]];

      await ensureLogsSheet(sheets, process.env.GSHEET_ID);
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GSHEET_ID,
        range: 'Logs!A:K',
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    } catch (e) {
      console.warn("Sheets append error:", e?.message || e);
    }

    // 3) Devuelve JSON bonito
    res.setHeader("Content-Type","application/json; charset=utf-8");
    return res.status(200).send(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}

async function ensureLogsSheet(sheets, spreadsheetId){
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets||[]).some(s=>s.properties?.title==="Logs");
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [ { addSheet: { properties: { title: "Logs" } } } ] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: "Logs!A1:K1", valueInputOption: "RAW",
      requestBody: { values: [[
        "timestamp","email","nivel","titulo","precio","cuota","nota","fortalezas","mejoras","respuesta_modelo","transcript"
      ]]}
    });
  }
}
