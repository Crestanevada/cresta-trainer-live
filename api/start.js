// /api/start.js
import fs from "fs";
import path from "path";

function sanitizeText(s) {
  if (!s) return "";
  return String(s)
    .replace(/<[^>]*>/g, " ")                 // quita etiquetas HTML
    .replace(/if\s*\([^)]*\)\s*return;?/gi, " ") // quita "if (...) return;"
    .replace(/[`$]/g, "")                     // evita romper templates
    .replace(/\s+/g, " ")                     // espacios extra
    .trim();
}

export default async function handler(req, res) {
  try {
    const file = path.join(process.cwd(), "public", "stock.txt");
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error("stock.txt está vacío");

    const pick = lines[Math.floor(Math.random() * lines.length)];
    const [t = "", p = "", m = "", u = ""] = pick.split("|").map(x => sanitizeText(x));

    const car = { title: t, price: p, monthly: m, url: u };

    // Construye líneas visibles
    const parts = [];
    if (t) parts.push(t);
    const priceLine = [p, m].filter(Boolean).join(" • ");
    if (priceLine) parts.push(priceLine);
    if (u) parts.push(u);

    const first =
      `Hola, estaba mirando este coche:\n` +
      `${parts.join("\n")}\n` +
      `¿Podrías confirmarme si está disponible para verlo esta semana?`;

    return res.status(200).json({ car, first });
  } catch (e) {
    // Fallback seguro si algo falla
    const car = { title: "SUV gasolina con dudas de consumo", price: "", monthly: "", url: "" };
    const first = "Hola, vi un coche en vuestra web y me gustaría saber si lo puedo ver en esta tienda o traerlo para probarlo.";
    return res.status(200).json({ car, first, warning: e?.message || "fallback" });
  }
}
