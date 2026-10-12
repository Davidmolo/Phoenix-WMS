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

/**
 * Open a server-rendered HTML document (e.g. a Bill of Lading) in a new tab and
 * trigger the browser print dialog once it has loaded. Used for routes that return
 * `text/html` and require the auth header, so a plain `<a href>` won't work.
 */
export function openHtmlForPrint(html: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    const tryPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        /* user may have already closed the tab */
      }
    };
    win.addEventListener("load", tryPrint, { once: true });
    // Some browsers fire load before the listener attaches
    window.setTimeout(tryPrint, 500);
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
