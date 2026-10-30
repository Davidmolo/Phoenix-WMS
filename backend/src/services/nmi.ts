import { env } from "../config/env";

export function nmiReady() {
  return Boolean(env.nmiSecurityKey && env.nmiTokenizationKey);
}

/** Charge a one-time Payment Component token. Amount is dollars. */
export async function chargePaymentToken(amount: number, paymentToken: string) {
  if (!env.nmiSecurityKey) {
    throw new Error("NMI is not configured");
  }
  const dollars = Math.round(amount * 100) / 100;
  if (!Number.isFinite(dollars) || dollars < 1) {
    throw new Error("Amount must be at least $1.00. A sandbox charge under $1.00 is declined on purpose.");
  }
  const response = await fetch(`${env.nmiApiBase.replace(/\/$/, "")}/payments/sale`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.nmiSecurityKey,
    },
    body: JSON.stringify({
      amount: dollars.toFixed(2),
      payment_details: { payment_token: paymentToken },
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    response?: string;
    responsetext?: string;
    response_text?: string;
    message?: string;
    id?: string;
    transactionid?: string;
  };
  const ok = String(data.response) === "1";
  if (!response.ok || !ok) {
    throw new Error(data.message || data.response_text || data.responsetext || "The payment was declined");
  }
  return {
    transactionId: String(data.id || data.transactionid || ""),
    amount: dollars,
  };
}
