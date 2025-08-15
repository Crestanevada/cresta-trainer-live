// /api/mode.js
import { google } from "googleapis";

const ORDER = ["FÁCIL","MEDIO","DIFÍCIL","IMPOSIBLE"];

export default async function handler(req, res) {
  try {
    const email = String(req.query.sellerEmail || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "sellerEmail requerido" });

    const sheets = await getSheets();
    // Leer últimas 50 filas de Logs (ajustable)
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GSHEET_ID,
      range: "Logs!A:K"
    });

    const rows = r.data.values || [];
    // Encabezados esperados: timestamp, email, nivel, titulo, precio, cuota, nota, fortalezas, mejoras, respuesta_modelo, transcript
    const byUser = rows
      .slice(1)
      .filter(row => (row[1] || "").toLowerCase() === email)
      .map(row => ({
        ts: row[0],
        level: row[2],
        score: Number(row[6] || 0)
      }))
      // orden descendente por fecha
      .sort((a,b)=> new Date(b.ts) - new Date(a.ts));

    let level = "FÁCIL";
    if (byUser.length === 0) {
      return res.status(200).json({ level });
    }

    // Cuenta racha de días consecutivos con score >= 7 (últimos días)
    let streak = 0;
    for (const item of byUser) {
      if ((item.score || 0) >= 7) streak++;
      else break;
    }

    const lastLevel = byUser[0]?.level?.toUpperCase() || "FÁCIL";
    const idx = Math.max(0, ORDER.indexOf(lastLevel));
    if (streak >= 3) {
      // sube de nivel
      level = ORDER[(idx + 1) % ORDER.length];
    } else {
      level = ORDER[idx];
    }

    return res.status(200).json({ level });
  } catch (e) {
    // Si falla, vuelve a FÁCIL por defecto
    return res.status(200).json({ level: "FÁCIL", warning: e?.message || "fallback" });
  }
}

async function getSheets(){
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version:"v4", auth });
}
