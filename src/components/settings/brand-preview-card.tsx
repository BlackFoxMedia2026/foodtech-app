"use client";

import { useState } from "react";

const HEX_RE = /^#[0-9a-fA-F]{6,8}$/;

/**
 * Dove finisce il brand: le **quattro superfici** che vede un cliente.
 *
 * ## Perché quattro e non una
 *
 * Prima era un'anteprima sola e generica: un'intestazione, un rettangolo
 * grigio, un pulsante. Diceva «il colore va sul pulsante», che è vero e non
 * serve a decidere. La domanda di chi sta scegliendo un colore è un'altra:
 * **dove lo vedrà un cliente, e come starà accanto a un prezzo, a una
 * password, a una faccina di gradimento?**
 *
 * Le quattro superfici sono le sole pagine che un cliente di Tavolo incontra:
 * il modulo di prenotazione, il menu che apre dal QR sul tavolo, il portale
 * Wi-Fi, e la domanda «com'è andata». Ognuna usa il brand in un modo diverso —
 * il colore su un pulsante d'azione, su un prezzo, su una password da copiare,
 * su una scala da zero a dieci — e un colore che funziona sul primo può essere
 * illeggibile sull'ultimo.
 *
 * ## Cosa sono e cosa non sono
 *
 * Sono **anteprime**, non le pagine vere: riproducono la struttura e i testi di
 * ciascuna superficie con i valori del locale, e stanno in una scheda delle
 * impostazioni. Renderizzare le pagine pubbliche per davvero richiederebbe i
 * dati del locale — la carta, i turni, la rete — dentro un modulo che si sta
 * ancora compilando, e mostrerebbe una pagina vuota invece di un'anteprima.
 *
 * Il testo lo dichiara, perché un'anteprima presa per la pagina vera è una
 * promessa che qualcuno verrà a riscuotere.
 *
 * ## Una sola per volta
 *
 * Quattro anteprime impilate allungherebbero Impostazioni di seicento pixel
 * per una cosa che si guarda mentre si sceglie un colore. Si sceglie quale
 * vedere, e la scelta è un pulsante — non uno stato che qualcuno deve
 * ricordarsi di riportare.
 */
type Superficie = "prenota" | "menu" | "wifi" | "sondaggio";

const SUPERFICI: { id: Superficie; etichetta: string }[] = [
  { id: "prenota", etichetta: "Prenotazione" },
  { id: "menu", etichetta: "Menu" },
  { id: "wifi", etichetta: "Wi-Fi" },
  { id: "sondaggio", etichetta: "Sondaggio" },
];

export function BrandPreviewCard({
  name,
  logoUrl,
  primaryColor,
  secondaryColor,
}: {
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}) {
  const [quale, setQuale] = useState<Superficie>("prenota");

  const primary = primaryColor && HEX_RE.test(primaryColor) ? primaryColor : "#FFD400";
  const secondary = secondaryColor && HEX_RE.test(secondaryColor) ? secondaryColor : "#B6B6B6";
  const nome = name || "Il tuo ristorante";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Superficie da vedere">
        {SUPERFICI.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={quale === s.id}
            onClick={() => setQuale(s.id)}
            className={`tocco-comodo rounded-full px-2.5 py-1 text-xs transition-colors ${
              quale === s.id ? "bg-cream text-clay-ink" : "bg-current/10 text-muted-foreground"
            }`}
          >
            {s.etichetta}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white text-carbon-900 shadow-sm">
        {/* L'intestazione è la stessa su tutte e quattro: è il punto in cui il
            cliente riconosce il locale, e deve essere identica ovunque. */}
        <div
          className="flex items-center gap-2 border-b border-border/60 p-3"
          style={{ backgroundColor: `${secondary}22` }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
          ) : (
            <div className="h-6 w-6 rounded bg-secondary" />
          )}
          <p className="truncate text-sm font-semibold">{nome}</p>
        </div>

        <div className="space-y-3 p-4 text-sm">
          {quale === "prenota" && (
            <>
              <p className="text-xs text-carbon-900/60">Prenotazione presso {nome}</p>
              {/* Gli orari: il colore del brand marca quello scelto, ed è il
                  punto in cui si vede se regge accanto a del testo piccolo. */}
              <div className="flex gap-1.5">
                {["19:30", "20:00", "20:30"].map((ora, i) => (
                  <span
                    key={ora}
                    className="rounded-md px-2 py-1 text-xs"
                    style={
                      i === 1
                        ? { backgroundColor: primary, color: "#fff" }
                        : { backgroundColor: `${secondary}33` }
                    }
                  >
                    {ora}
                  </span>
                ))}
              </div>
              <div className="h-8 rounded-md" style={{ backgroundColor: `${secondary}22` }} />
              <button
                type="button"
                disabled
                className="w-full rounded-md px-3 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: primary }}
              >
                Prenota ora
              </button>
            </>
          )}

          {quale === "menu" && (
            <>
              <p className="text-xs uppercase tracking-wide text-carbon-900/50">Antipasti</p>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">Vitello tonnato</span>
                {/* Il prezzo prende il colore del brand: è l'uso più difficile,
                    perché è testo piccolo su fondo chiaro. */}
                <span className="shrink-0 font-medium" style={{ color: primary }}>
                  16,00 €
                </span>
              </div>
              <p className="text-xs text-carbon-900/60">
                Sottile fesa di vitello, salsa tonnata, capperi di Pantelleria.
              </p>
              <p className="text-[11px] text-carbon-900/50">Contiene: pesce, uova</p>
            </>
          )}

          {quale === "wifi" && (
            <>
              <p className="text-xs text-carbon-900/60">Wi-Fi ospiti</p>
              <p className="text-xs text-carbon-900/60">
                Lascia un contatto e ricevi subito la password della rete.
              </p>
              <div className="h-8 rounded-md" style={{ backgroundColor: `${secondary}22` }} />
              <button
                type="button"
                disabled
                className="w-full rounded-md px-3 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: primary }}
              >
                Mostra la password
              </button>
              {/* La password col colore del brand: è la cosa che il cliente
                  copia, quindi deve essere leggibile prima che bella. */}
              <p className="text-center font-mono text-base" style={{ color: primary }}>
                aurora2026
              </p>
            </>
          )}

          {quale === "sondaggio" && (
            <>
              <p className="text-xs text-carbon-900/60">Quanto ci consiglieresti a un amico?</p>
              <div className="flex flex-wrap gap-1">
                {[0, 5, 8, 9, 10].map((n) => (
                  <span
                    key={n}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
                    style={
                      n === 9
                        ? { backgroundColor: primary, color: "#fff" }
                        : { backgroundColor: `${secondary}33` }
                    }
                  >
                    {n}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-carbon-900/50">Un tocco, e hai finito.</p>
            </>
          )}
        </div>
      </div>

      <p className="t-nota">
        Anteprime: riproducono la struttura delle pagine pubbliche con i tuoi valori, non sono le
        pagine vere.
      </p>
    </div>
  );
}
