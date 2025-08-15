import OpenAI from "openai";
import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // -------- leer body --------
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const { transcript = [], car = {}, nivel = "FÁCIL", email = "desconocido@empresa.com" } = body;

    // -------- 1) EVALUACIÓN (OpenAI) --------
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const promptEval = `
Eres un evaluador de ventas B2C en automoción. Analiza el diálogo (vendedor vs cliente) y puntúa de 0 a 10.
Devuelve JSON compacto con:
- nota_total (0–10),
- desglose: { inicio, necesidades, propuesta, objeciones, cierre } (0–2 cada uno),
- fortalezas: array de frases,
- mejoras: array de frases,
- respuesta_modelo: ejemplo de respuesta ideal siguiente del vendedor (máx 300 chars).
Ten en cuenta el nivel (${nivel}). Penaliza si no se gestionan objeciones o no se busca siguiente paso.
Transcripción:
${JSON.stringify(transcript)}
    `.trim();

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: "Evalúa justo y práctico. Devuelve SOLO JSON válido." },
        { role: "user", content: promptEval }
      ]
    });

    let raw = r.choices?.[0]?.message?.content?.trim() || "{}";
    // Intento robusto: si OpenAI añade texto, intenta extraer JSON
    const m = raw.match(/\{[\s\S]*\}$/);
    if (m) raw = m[0];

    let result;
    try { result = JSON.parse(raw); }
    catch { result = { nota_total: 0, desglose:{inicio:0,necesidades:0,propuesta:0,objeciones:0,cierre:0}, fortalezas:[], mejoras:[], respuesta_modelo:""}; }

    // -------- 2) REGISTRO EN GOOGLE SHEETS --------
    // Requiere variables de entorno:
    // SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
    const sheetId = process.env.SHEET_ID;
    const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const saKey   = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, '\n');

    if (!sheetId || !saEmail || !saKey) {
      console.warn("Sheets ENV incompletas: no se registrará en Google Sheets.");
    } else {
      const auth = new google.auth.JWT({
        email: saEmail,
        key: saKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      const sheets = google.sheets({ version: 'v4', auth });

      const ts = new Date().toISOString();
      const fila = [
        ts,                 // A: timestamp
        email,              // B: vendedor
        nivel,              // C: nivel
        car?.title || "",   // D: coche (titulo)
        car?.price || "",   // E: precio
        car?.monthly || "", // F: cuota
        Number(result?.nota_total ?? 0),                                 // G: nota_total
        JSON.stringify(result?.desglose ?? {}),                          // H: desglose
        (result?.fortalezas || []).join(" | "),                          // I: fortalezas
        (result?.mejoras || []).join(" | "),                             // J: mejoras
        (result?.respuesta_modelo || "").slice(0, 300)                   // K: respuesta modelo (recortado)
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'Entrenamientos!A:K',          // hoja "Entrenamientos"
        valueInputOption: 'RAW',
        requestBody: { values: [fila] }
      });
    }

    // -------- 3) responder en la web (muestra el JSON bonito) --------
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(JSON.stringify(result, null, 2));

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
