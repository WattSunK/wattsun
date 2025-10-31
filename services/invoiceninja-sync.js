import axios from "axios";
import dotenv from "dotenv";
dotenv.config({ path: "./infra/.env.invoiceninja" });

const NINJA_URL = process.env.INVOICE_NINJA_URL;
const NINJA_TOKEN = process.env.INVOICE_NINJA_TOKEN;

export async function syncInvoice(invoice) {
  try {
    const payload = {
      client: { name: invoice.tenant_name },
      invoices: [{ number: invoice.id, amount: invoice.total, status_id: 1 }],
    };
    const res = await axios.post(`${NINJA_URL}/api/v1/invoices`, payload, {
      headers: { "X-Api-Token": NINJA_TOKEN },
    });
    console.log("✅ Synced invoice:", invoice.id);
    return res.data;
  } catch (err) {
    console.error("❌ Invoice Ninja sync failed:", err.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncInvoice({ id: "INV-DEMO-001", tenant_name: "Demo Tenant", total: 2500 });
}
