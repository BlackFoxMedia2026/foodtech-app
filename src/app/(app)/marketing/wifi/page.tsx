import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  MailCheck,
  Settings2,
  Ticket,
  Users,
  UtensilsCrossed,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartaKpi } from "@/components/ui/carta-kpi";
import { EmptyState } from "@/components/ui/empty-state";
import { accorda } from "@/lib/accordo";
import { getActiveVenue } from "@/lib/tenant";
import { cn, formatDateTime } from "@/lib/utils";
import { getWifiStats, listWifiLeads } from "@/server/wifi";

export const dynamic = "force-dynamic";

/**
 * Chi si è collegato alla rete.
 *
 * Il numero che conta non è quanti contatti sono stati raccolti: è quanti di
 * quelli **sono poi venuti a mangiare**. Un indirizzo email non è un cliente, e
 * un portale Wi-Fi che riempie una lista senza portare nessuno a tavola sta
 * solo accumulando dati di cui il locale è responsabile.
 *
 * La pagina parla la stessa lingua dei Coupon: quattro carte con il loro
 * dischetto, una barra appiccicata con lo stato del portale e le due viste a
 * capsula, e i contatti come schede in riga — iniziali, nome, recapiti, i
 * segni che contano (consenso, visite) e quando. Prima era una tabella di
 * testo nudo dentro una card, con le viste come due parole sospese.
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

  const viste = [
    { id: "tutti", nome: "Tutti", conto: stats.contatti, href: "/marketing/wifi", scelta: !soloMarketing },
    {
      id: "consenso",
      nome: "Con consenso",
      conto: stats.conMarketing,
      href: "/marketing/wifi?marketing=1",
      scelta: soloMarketing,
    },
  ];

  return (
    <div className="schermo animate-fade-in">
      <div className="fill-scroll -mx-4 px-4">
        {/* ── I quattro numeri ──────────────────────────────────────────── */}
        {stats.contatti > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2.5 md:gap-3.5 lg:grid-cols-4 lg:gap-4">
              <CartaKpi
                icona={Users}
                tono="bosco"
                valore={stats.contatti}
                etichetta={["Contatto", "Contatti"]}
                nota={`${stats.ultimi30} negli ultimi 30 giorni`}
              />
              {/* Il numero onesto, e l'unico in oro: dice se il portale serve. */}
              <CartaKpi
                icona={UtensilsCrossed}
                tono="bronzo"
                valore={stats.conPrenotazione}
                etichetta="Poi venuti a mangiare"
                nota="con almeno una prenotazione"
                allarme
              />
              <CartaKpi
                className="hidden sm:flex"
                icona={MailCheck}
                tono="petrolio"
                valore={stats.conMarketing}
                etichetta="Consenso marketing"
                nota="si possono scrivere"
              />
              <CartaKpi
                className="hidden sm:flex"
                icona={Ticket}
                tono="oliva"
                valore={`${stats.couponUsati}/${stats.couponEmessi}`}
                etichetta="Sconti usati"
                nota="su quelli emessi"
              />
            </div>

            <p className="mt-3 flex items-start gap-2 t-nota">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Il numero che dice se questa cosa serve è «poi venuti a mangiare»: un indirizzo email raccolto
              non è un cliente, ed è un dato di cui rispondi tu.
            </p>
          </>
        )}

        {/* ══ La barra: stato del portale, viste, configurazione ═══════════ */}
        {/* Non appiccicata, e senza fondo: l'elenco è a pagine, e una fascia
            piena sopra lo sfondo sfumato era il rettangolo grigio dei Coupon. */}
        <div className="mt-4 pb-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Lo stato del portale è la prima cosa: se è chiuso, l'elenco
                non cresce, e il resto della pagina è storia. */}
            <span
              className={cn(
                "inline-flex h-10 min-w-0 items-center gap-2 rounded-full border px-4 text-sm",
                attivo
                  ? "border-sage/40 bg-sage/10 text-foreground"
                  : "border-border bg-veil-6 text-muted-foreground",
              )}
            >
              <span className="relative grid h-2 w-2 place-items-center" aria-hidden="true">
                {attivo && <span className="absolute h-2 w-2 animate-ping rounded-full bg-sage/60" />}
                <span className={cn("h-2 w-2 rounded-full", attivo ? "bg-sage" : "bg-muted-foreground/50")} />
              </span>
              {attivo ? (
                <span className="truncate">
                  Portale attivo <span className="text-muted-foreground">· {ctx.venue.wifiNetworkName}</span>
                </span>
              ) : (
                "Portale chiuso"
              )}
            </span>

            <nav
              className="flex items-center gap-1 rounded-full border border-border/70 bg-card-sunken/70 p-1"
              aria-label="Filtra i contatti"
            >
              {viste.map((v) => (
                <Link
                  key={v.id}
                  href={v.href}
                  aria-current={v.scelta ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    v.scelta
                      ? "border border-accent/55 bg-accent/20 font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.nome}
                  <span
                    className={cn(
                      "tabular-nums",
                      v.scelta ? "text-accent-strong" : "text-tertiary-foreground",
                    )}
                  >
                    {v.conto}
                  </span>
                </Link>
              ))}
            </nav>

            <Button
              asChild
              variant={attivo ? "ghost" : "accent"}
              className={cn("h-10 sm:ml-auto", attivo && "pillola-comando rounded-full px-4")}
            >
              <Link href="/settings/wifi">
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                {attivo ? "Configurazione" : "Apri il portale"}
              </Link>
            </Button>
          </div>
        </div>

        {/* ══ Chi si è collegato ══════════════════════════════════════════ */}
        {elenco.items.length === 0 ? (
          <EmptyState
            className="mt-2"
            icon={Wifi}
            title={soloMarketing ? "Nessuno con consenso, per ora" : "Nessuno si è ancora collegato"}
          >
            {!attivo
              ? "Il portale è chiuso. Si apre da Impostazioni, con il nome della rete e la password."
              : soloMarketing
                ? "Chi si collega può scegliere di ricevere le vostre comunicazioni: qui compare solo chi ha detto sì."
                : "Metti un QR code del portale sui tavoli o al bancone: chi lo apre lascia un contatto e riceve la password."}
          </EmptyState>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-2">
              {elenco.items.map((l) => {
                const tornato = l.visite > 0;
                const contatti = [l.email, l.phone].filter(Boolean).join(" · ");
                return (
                  <li
                    key={l.id}
                    className="surface group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_9.5rem_auto] sm:px-5"
                  >
                    {/* Le iniziali: dorate per chi è poi venuto a mangiare,
                        quiete per chi ha solo lasciato un indirizzo. */}
                    <span
                      className={cn(
                        "grid h-10 w-10 place-items-center rounded-full text-sm font-semibold uppercase",
                        tornato
                          ? "bg-primary text-primary-foreground shadow-[0_6px_14px_-6px_rgba(16,32,26,0.5)]"
                          : "bg-[#c9a96a]/20 text-accent-strong",
                      )}
                      aria-hidden="true"
                    >
                      {iniziali(l.name)}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-[0.9375rem] font-semibold leading-snug text-card-foreground">
                        {l.name}
                      </p>
                      <p className="truncate text-xs text-tertiary-foreground">
                        {contatti || "nessun recapito"}
                      </p>
                    </div>

                    {/* I due segni che contano, sempre nello stesso posto. */}
                    <div className="col-span-3 col-start-2 row-start-2 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-end">
                      {tornato && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          <UtensilsCrossed className="h-3 w-3" aria-hidden="true" />
                          {l.visite} {accorda(["visita", "visite"], l.visite)}
                        </span>
                      )}
                      {l.consentMarketing ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sage/40 bg-sage/10 px-2.5 py-1 text-xs text-foreground">
                          <Check className="h-3 w-3 text-sage" aria-hidden="true" />
                          Consenso
                        </span>
                      ) : (
                        <span className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-tertiary-foreground">
                          Senza consenso
                        </span>
                      )}
                    </div>

                    <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                      {formatDateTime(l.createdAt, "it-IT", ctx.venue.timezone)}
                    </span>

                    {/* La freccia della scheda ospite, come nei Coupon. Chi
                        non è diventato ospite non ha una scheda da aprire. */}
                    {l.guestId ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="pillola-comando col-start-3 row-start-1 h-9 w-9 rounded-full sm:col-start-5"
                      >
                        <Link href={`/guests/${l.guestId}`} aria-label={`Apri la scheda di ${l.name}`}>
                          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    ) : (
                      <span className="col-start-3 row-start-1 h-9 w-9 sm:col-start-5" aria-hidden="true" />
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pb-4 text-sm">
              <p className="text-muted-foreground">
                Da {da} a {a} di {elenco.totale}
              </p>
              {/* `disabled` su un link non esiste: si toglie il puntatore e
                  si dice all'assistente vocale che quel passo non c'è. */}
              {elenco.pagine > 1 && (
                <nav className="flex gap-2" aria-label="Pagine dei contatti Wi-Fi">
                  <Button asChild variant="ghost" className="pillola-comando h-9 rounded-full px-3.5">
                    <Link
                      href={link(Math.max(1, elenco.pagina - 1))}
                      aria-disabled={elenco.pagina === 1}
                      className={elenco.pagina === 1 ? "pointer-events-none opacity-50" : undefined}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Precedenti
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="pillola-comando h-9 rounded-full px-3.5">
                    <Link
                      href={link(Math.min(elenco.pagine, elenco.pagina + 1))}
                      aria-disabled={elenco.pagina === elenco.pagine}
                      className={elenco.pagina === elenco.pagine ? "pointer-events-none opacity-50" : undefined}
                    >
                      Successivi <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </nav>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function iniziali(nome: string): string {
  const parti = nome.trim().split(/\s+/).filter(Boolean);
  return ((parti[0]?.[0] ?? "") + (parti.length > 1 ? parti[parti.length - 1][0] : "")) || "·";
}
