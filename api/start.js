// /api/start.js
export default async function handler(req, res) {
  try {
    // Stock básico local (sin HTML, sin enlaces)
    const stock = [
      { title: "Volkswagen Golf 1.5 TSI 2020", price: "19.900€", monthly: "299€/mes", url: "" },
      { title: "Toyota C-HR 1.8 Hybrid 2020",   price: "21.900€", monthly: "319€/mes", url: "" },
      { title: "Kia Sportage 1.6 GDi 2018",     price: "16.500€", monthly: "249€/mes", url: "" },
      { title: "BMW Serie 1 118d 2019",         price: "18.500€", monthly: "289€/mes", url: "" },
      { title: "Fiat 500X 1.6 2018",            price: "13.990€", monthly: "206€/mes", url: "" }
    ];

    const car = stock[Math.floor(Math.random()*stock.length)];

    let first = `Hola, estaba mirando este coche:\n`;
    first += car.title ? `${car.title}\n` : "";
    const priceLine = [car.price, car.monthly].filter(Boolean).join(" • ");
    first += priceLine ? `${priceLine}\n` : "";
    first += "¿Podrías confirmarme si está disponible para verlo esta semana?";

    return res.status(200).json({ car, first });
  } catch (error) {
    const car = { title: "SUV gasolina", price: "", monthly: "", url: "" };
    const first = "Hola, vi un coche en vuestra web y me gustaría saber si lo puedo ver en esta tienda o traerlo para probarlo.";
    return res.status(200).json({ car, first, warning: error?.message || "fallback" });
  }
}
