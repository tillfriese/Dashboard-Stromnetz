"use client";

/** Last-resort error page if the root layout itself fails (renders its own document). */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f8fafc", color: "#0f172a", margin: 0 }}>
        <title>Fehler · Netzlage</title>
        <main style={{ maxWidth: 480, margin: "15vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Netzlage ist gerade nicht verfügbar</h1>
          <p style={{ color: "#64748b" }}>Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite in einem Moment neu.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ background: "#4f46e5", color: "#fff", border: 0, borderRadius: 12, padding: "8px 16px", fontSize: 14, cursor: "pointer" }}
          >
            Erneut versuchen
          </button>
        </main>
      </body>
    </html>
  );
}
