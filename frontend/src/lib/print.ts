/** Soft-print helper: only the open .print-sheet / label overlay is laid out. */
export function printDocument() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const root = document.documentElement;
  const body = document.body;
  root.classList.add("printing");
  body.classList.add("printing");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    root.classList.remove("printing");
    body.classList.remove("printing");
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);

  // Let the class apply before the browser snapshots the page
  requestAnimationFrame(() => {
    window.print();
    // Safari / some Chromium builds skip afterprint
    window.setTimeout(cleanup, 1500);
  });
}
