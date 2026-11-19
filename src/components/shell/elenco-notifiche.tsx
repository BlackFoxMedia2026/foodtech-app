"use client";

import { useMemo, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { RigaNotifica, type NotificationItem } from "@/components/shell/notification-bell";
import { aspettoNotifica } from "@/lib/notifiche-aspetto";
import { cn } from "@/lib/utils";

const GIORNO = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });

function chiaveGiorno(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function nomeGiorno(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date();
  const ieri = new Date(oggi.getTime() - 86_400_000);
  if (chiaveGiorno(d.toISOString()) === chiaveGiorno(oggi.toISOString())) return "Oggi";
  if (chiaveGiorno(d.toISOString()) === chiaveGiorno(ieri.toISOString())) return "Ieri";
  const s = GIORNO.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Lo storico delle notifiche: filtri in alto, giorni come intestazioni,
 * ogni avviso con la sua icona. Segnare come letta avviene aprendola, come
 * nella campanella; «Segna tutte lette» le chiude in blocco.
 */
export function ElencoNotifiche({ iniziali }: { iniziali: NotificationItem[] }) {
  const [notifiche, setNotifiche] = useState(iniziali);
  const [soloNuove, setSoloNuove] = useState(false);
  const [gruppo, setGruppo] = useState<string | null>(null);

  const nuove = notifiche.filter((n) => !n.readAt).length;
  const gruppi = useMemo(() => {
    const conta = new Map<string, number>();
    for (const n of notifiche) {
      const g = aspettoNotifica(n.kind).gruppo;
      conta.set(g, (conta.get(g) ?? 0) + 1);
    }
    return [...conta.entries()].sort((a, b) => b[1] - a[1]);
  }, [notifiche]);

  const visibili = notifiche.filter(
    (n) => (!soloNuove || !n.readAt) && (!gruppo || aspettoNotifica(n.kind).gruppo === gruppo),
  );
  const perGiorno: { giorno: string; righe: NotificationItem[] }[] = [];
  for (const n of visibili) {
    const g = nomeGiorno(n.createdAt);
    const ultimo = perGiorno[perGiorno.length - 1];
    if (ultimo?.giorno === g) ultimo.righe.push(n);
    else perGiorno.push({ giorno: g, righe: [n] });
  }

  async function segna(id: string) {
    setNotifiche((p) => p.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {
      /* resta segnata qui: alla prossima apertura si riallinea */
    }
  }

  async function segnaTutte() {
    setNotifiche((p) => p.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
    } catch {
      /* idem */
    }
  }

  const pillola = (attiva: boolean) =>
    cn(
      "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors",
      attiva
        ? "bg-segment font-medium text-segment-ink"
        : "bg-card/60 text-muted-foreground ring-1 ring-inset ring-border/70 hover:text-foreground",
    );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl text-foreground">Notifiche</h1>
          <p className="text-sm text-muted-foreground">
            {nuove > 0 ? `${nuove} da leggere su ${notifiche.length}` : `${notifiche.length} notifiche, tutte lette`}
          </p>
        </div>
        {nuove > 0 && (
          <button
            type="button"
            onClick={segnaTutte}
            className="vetro flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-white/40"
          >
            <CheckCheck className="h-4 w-4 text-sage-strong" aria-hidden="true" />
            Segna tutte lette
          </button>
        )}
      </header>

      <nav aria-label="Filtra le notifiche" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button type="button" className={pillola(!soloNuove && !gruppo)} onClick={() => { setSoloNuove(false); setGruppo(null); }}>
          Tutte
        </button>
        <button type="button" className={pillola(soloNuove)} onClick={() => setSoloNuove((v) => !v)}>
          Da leggere
          {nuove > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white">{nuove}</span>
          )}
        </button>
        <span className="mx-1 w-px shrink-0 bg-border" aria-hidden="true" />
        {gruppi.map(([g]) => (
          <button key={g} type="button" className={pillola(gruppo === g)} onClick={() => setGruppo((x) => (x === g ? null : g))}>
            {g}
          </button>
        ))}
      </nav>

      {perGiorno.length === 0 ? (
        <div className="surface flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-sage-strong/10 text-sage-strong">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">
            {soloNuove ? "Niente da leggere: sei in pari." : "Nessuna notifica qui."}
          </p>
        </div>
      ) : (
        perGiorno.map((g) => (
          <section key={g.giorno} className="surface overflow-hidden rounded-2xl">
            <h2 className="border-b border-border/70 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {g.giorno}
            </h2>
            <ul className="space-y-0.5 p-1.5">
              {g.righe.map((n) => (
                <li key={n.id}>
                  <RigaNotifica n={n} grande onApri={() => !n.readAt && segna(n.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
