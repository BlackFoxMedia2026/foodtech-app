"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TINTA_TONO, aspettoNotifica, quandoNotifica } from "@/lib/notifiche-aspetto";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  kind?: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const POLL_INTERVAL_MS = 60_000;
/** Nella tendina le ultime, non tutte: il resto sta nella pagina. */
const NELLA_TENDINA = 6;

/**
 * La campanella (19 nov 2026: più larga, con icona e ora per ogni avviso, e
 * «Vedi tutte» che apre la pagina delle notifiche). Prima era una colonna
 * da 320 px con il titolo e il testo in grigio, e niente oltre le ultime.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    // Un'interruzione di rete passeggera non deve far cadere la pagina: questo
    // gira ogni minuto in sottofondo.
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error("Impossibile caricare le notifiche:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  async function markRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch (err) {
      console.error("Impossibile segnare la notifica come letta:", err);
      return;
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications/mark-all-read", { method: "POST" });
    } catch (err) {
      console.error("Impossibile segnare le notifiche come lette:", err);
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  const ultime = notifications.slice(0, NELLA_TENDINA);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={unreadCount > 0 ? `Notifiche, ${unreadCount} da leggere` : "Notifiche"}
          className="tondo-strumento relative h-10 w-10 rounded-lg md:h-[46px] md:w-[46px] border border-border text-foreground hover:bg-white/10"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl p-0">
        <div className="flex items-center gap-2 px-4 pb-3 pt-4">
          <span className="text-base font-semibold text-card-foreground">Notifiche</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-accent-strong/15 px-2 py-0.5 text-xs font-medium text-accent-strong">
              {unreadCount} {unreadCount === 1 ? "nuova" : "nuove"}
            </span>
          )}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Segna lette
            </button>
          )}
        </div>

        <div className="max-h-[26rem] overflow-y-auto border-t border-border/70 px-2 py-2">
          {ultime.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-sage-strong/10 text-sage-strong">
                <Bell className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground">{loading ? "Carico…" : "Nessuna notifica"}</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {ultime.map((n) => (
                <li key={n.id}>
                  <RigaNotifica
                    n={n}
                    onApri={() => {
                      setOpen(false);
                      if (!n.readAt) markRead(n.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link
          href="/notifiche"
          onClick={() => setOpen(false)}
          className="group flex items-center justify-center gap-1.5 border-t border-border/70 bg-sage-strong/[0.06] px-4 py-3 text-sm font-medium text-sage-strong transition-colors hover:bg-sage-strong/10"
        >
          Vedi tutte le notifiche
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Una notifica: icona del tipo, titolo, testo, quando. Condivisa con la pagina. */
export function RigaNotifica({
  n,
  onApri,
  grande = false,
}: {
  n: NotificationItem;
  onApri: () => void;
  grande?: boolean;
}) {
  const a = aspettoNotifica(n.kind);
  const Icona = a.icona;
  const nuova = !n.readAt;
  const contenuto = (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-secondary/60",
        grande && "px-4 py-3.5",
        nuova && "bg-accent/[0.07]",
      )}
    >
      <span className={cn("grid shrink-0 place-items-center rounded-full", TINTA_TONO[a.tono], grande ? "h-10 w-10" : "h-9 w-9")}>
        <Icona className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn("min-w-0 flex-1 text-sm leading-snug text-card-foreground", nuova && "font-semibold")}>
            {n.title}
          </p>
          <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground" suppressHydrationWarning>
            {quandoNotifica(n.createdAt)}
          </span>
        </div>
        {n.body && (
          <p className={cn("mt-0.5 text-xs leading-snug text-muted-foreground", !grande && "line-clamp-2")}>{n.body}</p>
        )}
      </div>
      {nuova && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Da leggere" />}
    </div>
  );
  return n.link ? (
    <Link href={n.link} onClick={onApri} className="block">
      {contenuto}
    </Link>
  ) : (
    <button type="button" onClick={onApri} className="block w-full text-left">
      {contenuto}
    </button>
  );
}
