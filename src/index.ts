import express from "express";
import fs from "fs";
import path from "path";
import { MercadoPagoConfig, Payment } from "mercadopago";

const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN ?? "TEST-..."; // token del cliente (OAuth / test)
const POLL_INTERVAL_MS = 60_000; // cada cuánto se vuelve a pedir a Mercado Pago

const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
const payment = new Payment(client);

const app = express();

const TEMPLATE_PATH = path.join(import.meta.dirname, "..","views", "index.html");
const MAX_MOVEMENTS = 30;

// -----------------------------------------------------------------------
// Movimientos de la cuenta de Mercado Pago
// -----------------------------------------------------------------------
type Movement = {
  id: number;
  date_created?: string | null;
  transaction_amount?: number | null;
  currency_id?: string | null;
  status?: string | null;
  payer_email?: string | null;
  payer_first_name?: string | null;
  payer_last_name?: string | null;
};

let movements: Movement[] = [];

function toMovement(p: any): Movement {
  return {
    id: p.id,
    date_created: p.date_created,
    transaction_amount: p.transaction_amount,
    currency_id: p.currency_id,
    status: p.status,
    payer_email: p.payer?.email,
    payer_first_name: p.payer?.first_name,
    payer_last_name: p.payer?.last_name,
  };
}

async function refreshMovements() {
  try {
    const result = await payment.search({
      options: { sort: "date_created", criteria: "desc", limit: MAX_MOVEMENTS },
    });
    movements = (result.results ?? []).map(toMovement);
  } catch (err) {
    console.error("error actualizando movimientos:", err);
  }
}

// -----------------------------------------------------------------------
// Template: reemplaza {{ROWS}} por las filas de la tabla.
// -----------------------------------------------------------------------
function renderIndex(): string {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const rows = movements
    .map((m) => {
      const status = m.status ?? "default";
      return `
      <tr>
        <td>${m.date_created ?? ""}</td>
        <td class="amount">$ ${m.transaction_amount ?? ""} ${m.currency_id ?? ""}</td>
        <td><span class="badge ${status}">${status}</span></td>
        <td>${[m.payer_first_name, m.payer_last_name].filter(Boolean).join(" ") || "-"}</td>
        <td>${m.payer_email ?? ""}</td>
      </tr>`;
    })
    .join("");

  return template.replace("{{ROWS}}", rows);
}

// -----------------------------------------------------------------------
// GET / : sirve la página con lo que haya en memoria en ese momento.
// El propio HTML se recarga solo cada POLL_INTERVAL_MS (ver template).
// -----------------------------------------------------------------------
app.get("/", async (_req, res) => {
  res.send(renderIndex());
});

const PORT = process.env.PORT ?? 3000;

refreshMovements()
  .catch((err) => console.error("error cargando movimientos iniciales:", err))
  .finally(() => {
    setInterval(refreshMovements, POLL_INTERVAL_MS);
    app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
  });
