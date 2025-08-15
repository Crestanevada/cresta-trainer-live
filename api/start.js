// /api/start.js
export default async function handler(req, res) {
  try {
    // Simulación de un stock de coches
    const stock = [
      { title: "BMW X5 3.0d 2020", price: "45.900€", monthly: "480€/mes", url: "" },
      { title: "Audi Q7 50 TDI 2019", price: "52.300€", monthly: "510€/mes", url: "" },
      { title: "Mercedes GLC 220d 2021", price: "49.800€", monthly: "495€/mes", url: "" }
    ];

    // Elegir coche aleatorio
    const car = stock[Math.floor(Math.random() * stock.length)];

    // Construir mensaje inicial sin HTML
    let first = `Hola, estaba mirando este coche:\n`;
    if (car.title) first += `${car.title}\n`;
    if (car.price || car.monthly) {
      const cuota = car.monthly ? ` • ${car.monthly}` : "";
      first += `${car.price || ""}${cuota}\n`;
    }
    if (car.url) first += `${car.url}`;

    return res.status(200).json({ car, first });
  } catch (error) {
    console.error("Error en /api/start:", error);
    return res.status(500).json({
      car: { title: "", price: "", monthly: "", url: "" },
      first: "Hola, vi un coche en vuestra web y me gustaría saber si lo puedo ver en esta tienda o traerlo para probarlo."
    });
  }
}
