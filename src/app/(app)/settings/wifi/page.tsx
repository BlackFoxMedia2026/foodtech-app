import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ExternalLink, ShieldCheck, Ticket, Users, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { cifraturaAttiva, decifra } from "@/lib/cifratura";
import { accorda } from "@/lib/accordo";
import { cn, daQuando } from "@/lib/utils";
import { getWifiStats, statoPortale } from "@/server/wifi";
import { FlussoCliente } from "@/components/settings/wifi/flusso-cliente";
import { AnteprimaPortale } from "@/components/settings/wifi/anteprima-portale";
import { BuilderPortale } from "@/components/settings/wifi/builder-portale";
import { ComandiPortale, StatoRouter } from "@/components/settings/wifi/azioni-portale";

export const dynamic = "force-dynamic";

/**
 * Il pannello del portale Wi-Fi: una pagina **operativa**, in tre fasce.
 *
 * 1. **La fascia verde** — lo stato e i gesti di tutti i giorni: aprire il
 *    portale, stampare il QR, collegarlo al router, sospenderlo. Sotto il nome
 *    della rete, quanti contatti ha portato e da quando non entra nessuno.
 * 2. **Il percorso del cliente** — quattro tappe: spiega a cosa serve la cosa
 *    a chi la guarda per la prima volta, e non occupa più di una riga.
 * 3. **Il builder** — le schede a sinistra e il telefono a destra, che cambia
 *    mentre si scrive.
 *
 * Prima era una pagina «a metà»: una carta di stato con un solo pulsante che
 * portava fuori («Gestisci»), tre numeri che stanno già nella pagina dei
 * contatti, due carte di azioni a metà altezza e un'anteprima che non si
 * poteva cambiare da lì. Il link da copiare è sparito: serve al router e al
 * QR, e tutti e due lo ricevono già dai loro comandi.
 *
 * ## La riga che non si sposta
 *
 * Quando il portale è acceso, la sola cosa che **non sappiamo** è se il router
 * lo stia usando: nessun apparato ce lo dice. Resta dichiarata «da
 * verificare» finché non è il locale a spuntarla — vedi `StatoRouter`.
 */
export default async function WifiSettingsPage() {
  const ctx = await getActiveVenue();
  const v = ctx.venue;
  const canManage = can(ctx.role, "manage_venue");

  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const portaleUrl = `${proto}://${host}/wifi/${v.slug}`;

  const stato = statoPortale(v);
  const attivo = stato.stato === "attivo";
  const stats = stato.configurato ? await getWifiStats(ctx.venueId) : null;

  const anteprima = {
    venueName: v.name,
    logoUrl: v.wifiPortalLogoUrl ?? v.brandLogoUrl,
    accent: v.wifiPortalAccent,
    welcome: v.wifiPortalWelcome,
    legal: v.wifiPortalLegal,
    chiediEmail: v.wifiAskEmail,
    chiediTelefono: v.wifiAskPhone,
    chiediMarketing: v.wifiAskMarketing,
    conCoupon: v.wifiAutoCouponEnabled,
  };

  return (
    <div className="schermo animate-fade-in gap-3">
      <Button asChild variant="ghost" size="sm" className="fissa self-start">
        <Link href="/settings">
          <ArrowLeft className="h-4 w-4" /> Impostazioni
        </Link>
      </Button>

      <div className="fill-scroll -mx-4 px-4">
        <div className="space-y-5 pb-4">
          {stato.stato === "da_configurare" ? (
            /* Il vuoto, con dentro la cosa che si otterrà: l'anteprima sta qui
               e non dopo la configurazione perché è quella che spiega la
               funzione a chi non l'ha mai accesa. */
            <>
              <header>
                <h1 className="t-titolo-pagina">Portale Wi-Fi</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Trasforma il Wi-Fi del locale in un nuovo punto di contatto con i tuoi clienti.
                </p>
              </header>

              <FlussoCliente />

              <section className="surface grid items-start gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h2 className="text-display text-xl">Portale Wi-Fi non configurato</h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      Bastano pochi passaggi per iniziare a raccogliere contatti dal Wi-Fi del locale. Serve
                      solo il nome della rete ospiti e la sua password.
                    </p>
                  </div>

                  {/* Tre righe, e nessuna è una promessa che non manteniamo. */}
                  <ul className="space-y-2.5">
                    {[
                      {
                        icona: Users,
                        testo:
                          "I contatti entrano nel CRM del locale, accanto a prenotazioni e visite — non in un elenco a parte.",
                      },
                      {
                        icona: ShieldCheck,
                        testo:
                          "Il consenso al marketing è una spunta separata e facoltativa, registrata con data, ora e provenienza.",
                      },
                      {
                        icona: Ticket,
                        testo: "Se vuoi, chi si collega riceve anche uno sconto personale per tornare.",
                      },
                    ].map((riga) => (
                      <li key={riga.testo} className="flex items-start gap-3 text-sm text-muted-foreground">
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#c9a96a]/20 text-accent-strong"
                          aria-hidden="true"
                        >
                          <riga.icona className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 pt-1.5">{riga.testo}</span>
                      </li>
                    ))}
                  </ul>

                  {canManage ? (
                    <Button asChild className="h-11 rounded-full px-5">
                      <Link href="/settings/wifi/configura">Configura il Wi-Fi</Link>
                    </Button>
                  ) : (
                    <p className="t-nota">Il tuo ruolo non consente di configurare il portale.</p>
                  )}
                </div>

                <AnteprimaPortale dati={anteprima} className="hidden max-w-[260px] lg:block" />
              </section>
            </>
          ) : (
            <>
              {/* ══ La fascia verde: stato e comandi ═══════════════════════ */}
              <section
                className={cn(
                  "relative overflow-hidden rounded-[1.75rem] p-5 text-[#f7f3ea] md:p-6",
                  "bg-[radial-gradient(90%_160%_at_0%_0%,rgba(201,169,106,0.24),transparent_50%),linear-gradient(135deg,#25402f,#1d3227_55%,#16271e)]",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_30px_-16px_rgba(16,32,26,0.65),0_2px_6px_-2px_rgba(16,32,26,0.25)]",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-6 gap-y-5">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <span
                      className={cn(
                        "relative grid h-14 w-14 shrink-0 place-items-center rounded-full ring-1",
                        attivo
                          ? "bg-[#f7f3ea]/12 text-[#f7f3ea] ring-[#f7f3ea]/20"
                          : "bg-black/15 text-[#f7f3ea]/55 ring-[#f7f3ea]/10",
                      )}
                      aria-hidden="true"
                    >
                      <Wifi className="h-6 w-6" />
                      {attivo && (
                        <span className="absolute right-0 top-0 grid h-3.5 w-3.5 place-items-center rounded-full bg-[#1d3227]">
                          <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-[#9fd4a8]/60" />
                          <span className="h-2.5 w-2.5 rounded-full bg-[#9fd4a8]" />
                        </span>
                      )}
                    </span>

                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#ddc38f]">
                        Portale Wi-Fi · {attivo ? "attivo" : "sospeso"}
                      </p>
                      <h1 className="text-display mt-0.5 truncate text-2xl text-[#f7f3ea] md:text-[1.75rem]">
                        {stato.networkName}
                      </h1>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#f7f3ea]/70">
                        {stats && stats.contatti > 0 ? (
                          <Link
                            href="/marketing/wifi"
                            className="inline-flex items-center gap-1 font-medium text-[#f7f3ea] underline decoration-[#f7f3ea]/35 underline-offset-2 hover:decoration-[#f7f3ea]"
                          >
                            {stats.contatti} {accorda(["contatto", "contatti"], stats.contatti)} ·{" "}
                            {stats.conPrenotazione} poi venuti a mangiare
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        ) : (
                          <span>Nessun contatto, per ora</span>
                        )}
                        {stats?.ultimoAccesso && <span>Ultimo accesso {daQuando(stats.ultimoAccesso)}</span>}
                        {attivo && <StatoRouter collegatoIl={stato.routerCollegatoIl} canManage={canManage} />}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {attivo && (
                      <a
                        href={portaleUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="comando-crema inline-flex h-11 items-center gap-2 rounded-full px-5 text-[0.9375rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ddc38f]"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        Apri il portale
                      </a>
                    )}
                    <ComandiPortale portaleUrl={portaleUrl} attivo={attivo} canManage={canManage} />
                  </div>
                </div>

                {!attivo && (
                  <p className="mt-4 text-sm text-[#f7f3ea]/75">
                    La pagina pubblica è spenta e nessuno può lasciare contatti. La configurazione resta: si
                    riaccende con il tasto ▶.
                  </p>
                )}
              </section>

              {/* ══ Il percorso del cliente ════════════════════════════════ */}
              <FlussoCliente />

              {/* ══ Il builder ═════════════════════════════════════════════ */}
              {canManage ? (
                <BuilderPortale
                  iniziale={{
                    networkName: v.wifiNetworkName ?? "",
                    password: decifra(v.wifiPassword) ?? "",
                    welcome: v.wifiPortalWelcome ?? "",
                    legal: v.wifiPortalLegal ?? "",
                    accent: v.wifiPortalAccent ?? "",
                    logoUrl: v.wifiPortalLogoUrl ?? "",
                    redirectUrl: v.wifiRedirectUrl ?? "",
                    askEmail: v.wifiAskEmail,
                    askPhone: v.wifiAskPhone,
                    askMarketing: v.wifiAskMarketing,
                    couponEnabled: v.wifiAutoCouponEnabled,
                    couponPercent: v.wifiAutoCouponPercent,
                    couponDays: v.wifiAutoCouponDays,
                  }}
                  venueName={v.name}
                  venueLogoUrl={v.brandLogoUrl}
                />
              ) : (
                <section className="surface mx-auto max-w-sm p-5">
                  <p className="mb-3 text-center t-nota">Questa è la pagina che apre il cliente.</p>
                  <AnteprimaPortale dati={anteprima} />
                </section>
              )}

              {/* La cifratura, detta una volta: è la differenza fra «una
                  stringa inutile» e «la password della vostra rete» in una
                  copia del database. */}
              {cifraturaAttiva() ? (
                <p className="flex items-center gap-2 t-nota">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  La password della rete è salvata cifrata: nel database non c&apos;è il testo leggibile.
                </p>
              ) : (
                <p className="surface border-accent/40 bg-accent/10 p-4 text-sm">
                  La password della rete è salvata in chiaro: questa installazione non ha una chiave di cifratura
                  configurata (CHIAVE_CIFRATURA). Il portale funziona comunque.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
