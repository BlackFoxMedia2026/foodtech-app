import Link from "next/link";
import { Info, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getActiveVenue } from "@/lib/tenant";
import { getWifiStats, listWifiLeads } from "@/server/wifi";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Chi si è collegato alla rete.
 *
 * Il numero che conta non è quanti contatti sono stati raccolti: è quanti di
 * quelli **sono poi venuti a mangiare**. Un indirizzo email non è un cliente, e
 * un portale Wi-Fi che riempie una lista senza portare nessuno a tavola sta
 * solo accumulando dati di cui il locale è responsabile.
 *
 * Per la stessa ragione i coupon emessi stanno accanto a quelli usati: il primo
 * numero da solo racconta quanto abbiamo promesso, non quanto è tornato.
 */
export default async function WifiLeadsPage({
  searchParams,
}: {
  searchParams: { pagina?: string; marketing?: string };
}) {
  const ctx = await getActiveVenue();
  const soloMarketing = searchParams.marketing === "1";
  const pagina = Number(searchParams.pagina) || 1;

  const [stats, elenco] = await Promise.all([
    getWifiStats(ctx.venueId),
    listWifiLeads(ctx.venueId, { pagina, soloMarketing }),
  ]);

  const attivo = ctx.venue.wifiSetupAt != null;
  const da = (elenco.pagina - 1) * elenco.perPagina + 1;
  const a = Math.min(elenco.pagina * elenco.perPagina, elenco.totale);
  const link = (p: number) => `/marketing/wifi?pagina=${p}${soloMarketing ? "&marketing=1" : ""}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing / Wi-Fi</p>
          <h1 className="text-display text-3xl">Wi-Fi</h1>
          <p className="text-sm text-muted-foreground">
            {attivo
              ? `Portale attivo sulla rete «${ctx.venue.wifiNetworkName}».`
              : "Il portale è chiuso: si configura in Impostazioni."}
          </p>
        </div>
        <Button asChild variant={attivo ? "outline" : "accent"}>
          <Link href="/settings/wifi">{attivo ? "Configurazione" : "Configura il portale"}</Link>
        </Button>
      </header>

      {stats.contatti > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Contatti</p>
              <p className="mt-1 text-display text-2xl tabular-nums">{stats.contatti}</p>
              <p className="text-xs text-muted-foreground">{stats.ultimi30} negli ultimi 30 giorni</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Poi venuti a mangiare</p>
              <p className="mt-1 text-display text-2xl tabular-nums text-accent">{stats.conPrenotazione}</p>
              <p className="text-xs text-muted-foreground">hanno almeno una prenotazione</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Consenso marketing</p>
              <p className="mt-1 text-display text-2xl tabular-nums">{stats.conMarketing}</p>
              <p className="text-xs text-muted-foreground">si possono scrivere</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Sconti</p>
              <p className="mt-1 text-display text-2xl tabular-nums">
                {stats.couponUsati}
                <span className="text-base text-muted-foreground">/{stats.couponEmessi}</span>
              </p>
              <p className="text-xs text-muted-foreground">usati su emessi</p>
            </div>
          </div>

          <p className="flex items-start gap-2 text-xs text-tertiary-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {/* Il numero onesto è il secondo. Un elenco di contatti è un
                costo e una responsabilità finché non porta qualcuno a tavola. */}
            Il numero che dice se questa cosa serve è «poi venuti a mangiare»: un indirizzo email raccolto non è un
            cliente, ed è un dato di cui rispondi tu.
          </p>
        </>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Chi si è collegato</CardTitle>
          <div className="flex gap-2">
            <Button asChild variant={soloMarketing ? "ghost" : "outline"} size="sm">
              <Link href="/marketing/wifi">Tutti</Link>
            </Button>
            <Button asChild variant={soloMarketing ? "outline" : "ghost"} size="sm">
              <Link href="/marketing/wifi?marketing=1">Con consenso</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {elenco.items.length === 0 ? (
            <EmptyState icon={Wifi} compact title="Nessuno si è ancora collegato">
              {attivo
                ? "Metti un QR code del portale sui tavoli o al bancone: chi lo apre lascia un contatto e riceve la password."
                : "Il portale è chiuso. Si apre da Impostazioni, con il nome della rete e la password."}
            </EmptyState>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {elenco.items.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {l.guestId ? (
                          <Link href={`/guests/${l.guestId}`} className="underline">
                            {l.name}
                          </Link>
                        ) : (
                          l.name
                        )}
                        {l.consentMarketing && <Badge tone="success">consenso</Badge>}
                        {l.visite > 0 && (
                          <Badge tone="gold">
                            {l.visite} {l.visite === 1 ? "visita" : "visite"}
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[l.email, l.phone].filter(Boolean).join(" · ") || "nessun contatto"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <p className="text-muted-foreground">
                  Da {da} a {a} di {elenco.totale}
                </p>
                {/* `disabled` su un link non esiste: si toglie il puntatore e
                    si dice all'assistente vocale che quel passo non c'è. */}
                {elenco.pagine > 1 && (
                  <nav className="flex gap-2" aria-label="Pagine dei contatti Wi-Fi">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={link(Math.max(1, elenco.pagina - 1))}
                        aria-disabled={elenco.pagina === 1}
                        className={elenco.pagina === 1 ? "pointer-events-none opacity-50" : undefined}
                      >
                        Precedenti
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={link(Math.min(elenco.pagine, elenco.pagina + 1))}
                        aria-disabled={elenco.pagina === elenco.pagine}
                        className={elenco.pagina === elenco.pagine ? "pointer-events-none opacity-50" : undefined}
                      >
                        Successivi
                      </Link>
                    </Button>
                  </nav>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
