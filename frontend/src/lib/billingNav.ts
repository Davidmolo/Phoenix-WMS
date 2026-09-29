/** Hand off a customer into Billing when navigating from Customers. */
const KEY = "phoenix_wms_billing_customer";

export function setBillingCustomerId(customerId: string) {
  try {
    sessionStorage.setItem(KEY, customerId);
  } catch {
    /* ignore */
  }
}

/** Read once and clear so a later visit doesn't reuse a stale pick. */
export function takeBillingCustomerId(): string | null {
  try {
    const id = sessionStorage.getItem(KEY);
    if (id) sessionStorage.removeItem(KEY);
    return id;
  } catch {
    return null;
  }
}
