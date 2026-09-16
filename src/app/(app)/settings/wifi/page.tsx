import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft, ExternalLink, ShieldCheck, Ticket, Users, UtensilsCrossed, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { can, getActiveVenue } from "@/lib/tenant";
import { cifraturaAttiva } from "@/lib/cifratura";
import { getWifiStats, statoPortale } from "@/server/wifi";
import { FlussoCliente } from "@/components/settings/wifi/flusso-cliente";
import { AnteprimaPortale } from "@/components/settings/wifi/anteprima-portale";
import { ArrivoAlPortale, AvanzateWifi } from "@/components/settings/wifi/azioni-portale";

export const dynamic = "force-dynamic";

/**
 * Il pannello del portale Wi-Fi.
 *
 * ## Cos'era e perché è cambiato
 *
 * Era un modulo: otto campi aperti insieme — rete, password, benvenuto,
 * informativa, redirect, sconto — e nessuna riga che dicesse se la cosa fosse
 * accesa. Chi lo apriva doveva capire da solo cosa fare, in che ordine, e cosa
 * sarebbe successo al cliente. Le uniche due parole grandi della schermata
 * erano «La rete» e «Cosa legge il cliente», cioè due titoli di gruppo di
 * campi: la funzione, per il prodotto, era un elenco di impostazioni.
 *
 * Adesso questa pagina risponde a **quattro domande sole**, nell'ordine in cui
 * uno se le fa:
 *
 * 1. cosa succede al cliente (la fascia dei quattro passi);
 * 2. è acceso? (la carta di stato, che è la prima cosa grande);
 * 3. sta servendo a qualcosa? (tre numeri, non sei);
 * 4. come ci arrivano i clienti? (il QR o il router — le due strade, in
 *    quest'ordine, perché la prima funziona con qualunque apparato).
 *
 * I campi stanno nella procedura guidata, dietro «Modifica». Non è nasconderli:
 * è che si toccano una volta ogni sei mesi, mentre lo stato lo si guarda ogni
 * volta che si entra.
 *
 * ## La riga che non si sposta
 *
 * Quando il portale è acceso, la sola cosa che **non sappiamo** è se il router
 * lo stia usando: nessun apparato ce lo dice. Quella riga resta separata e
 * dichiarata «da verificare» finché non è il locale a spuntarla — vedi
 * `ArrivoAlPortale`. Inventare un pallino verde «collegato» sarebbe il
 * genere di stato finto che questo prodotto ha passato giorni a togliere.
 */

/** «12 minuti fa», «ieri»: l'ultimo accesso si legge, non si calcola. */
function daQuando(quando: Date): string {
  const minuti = Math.floor((Date.now() - quando.getTime()) / 60_000);
  if (minuti < 1) return "proprio ora";
  if (minuti < 60) return `${minuti} ${minuti === 1 ? "minuto" : "minuti"} fa`;
  const ore = Math.floor(minuti / 60);
  if (ore < 24) return `${ore} ${ore === 1 ? "ora" : "ore"} fa`;
  const giorni = Math.floor(ore / 24);
  if (giorni === 1) return "ieri";
  if (giorni < 30) return `${giorni} giorni fa`;
  return quando.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

/** Un numero del pannello: la cifra prima, l'etichetta sotto, la base in fondo. */
function Numero({ valore, etichetta, base }: { valore: number; etichetta: string; base: string }) {
  return (
    <div className="riquadro comodo bg-card/40">
      <p className="text-display text-2xl tabular-nums md:text-3xl">{valore}</p>
      <p className="mt-1 t-etichetta">{etichetta}</p>
      <p className="mt-0.5 t-nota">{base}</p>
    </div>
  );
}

export default async function WifiSettingsPage() {
  const ctx = await getActiveVenue();
  const v = ctx.venue;
  const canManage = can(ctx.role, "manage_venue");

  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const portaleUrl = `${proto}://${host}/wifi/${v.slug}`;

  const stato = statoPortale(v);
  // I numeri si leggono solo se c'è qualcosa da leggere: tre zeri sotto una
  // carta «non configurato» sono tre modi di dire la stessa cosa.
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

      <header className="fissa">
        <p className="t-etichetta">Impostazioni / Wi-Fi</p>
        <h1 className="mt-1 t-titolo-pagina">Portale Wi-Fi</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Trasforma il Wi-Fi del locale in un nuovo punto di contatto con i tuoi clienti.
        </p>
      </header>

      <div className="fill-scroll pr-0.5">
        <div className="space-y-5 pb-2">
          {/* Cosa succede al cliente, prima di qualunque campo. */}
          <FlussoCliente />

          {/* ------------------------------------------------------------ */}
          {/*  La carta di stato: la prima cosa grande della pagina.       */}
          {/* ------------------------------------------------------------ */}
          {stato.stato === "da_configurare" ? (
            /* Il vuoto, con dentro la cosa che si otterrà: l'anteprima sta qui
               e non dopo la configurazione perché è quella che spiega la
               funzione a chi non l'ha mai accesa. Una carta con un pulsante e
               mille pixel di nero sotto non dice cosa si sta per fare. */
            <section className="riquadro comodo grid items-start gap-6 border-accent/30 bg-accent/[0.06] p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full border border-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 space-y-1">
                    <h2 className="text-display text-xl">Portale Wi-Fi non configurato</h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      Bastano pochi passaggi per iniziare a raccogliere contatti dal Wi-Fi del locale. Serve
                      solo il nome della rete ospiti e la sua password.
                    </p>
                  </div>
                </div>

                {/* Tre righe, e nessuna è una promessa che non manteniamo:
                    sono le tre cose che succedono davvero quando qualcuno
                    compila il modulo. */}
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
                    <li key={riga.testo} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <riga.icona className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
                      <span className="min-w-0">{riga.testo}</span>
                    </li>
                  ))}
                </ul>

                {canManage ? (
                  <Button asChild variant="accent">
                    <Link href="/settings/wifi/configura">Configura il Wi-Fi</Link>
                  </Button>
                ) : (
                  <p className="t-nota">Il tuo ruolo non consente di configurare il portale.</p>
                )}
              </div>

              {/* Più piccola che altrove: qui è un'illustrazione di cosa si
                  otterrà, non lo strumento per controllare cosa si è scritto. */}
              <AnteprimaPortale dati={anteprima} className="hidden max-w-[240px] lg:block" />
            </section>
          ) : (
            <section className="riquadro comodo space-y-4 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <p className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        stato.stato === "attivo" ? "bg-sage-strong" : "border border-muted-foreground"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="t-etichetta">
                      {stato.stato === "attivo" ? "Portale attivo" : "Portale sospeso"}
                    </span>
                  </p>
                  <h2 className="text-display text-2xl">{stato.networkName}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <code className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                      {portaleUrl}
                    </code>
                    <CopyButton value={portaleUrl} variant="ghost" size="sm" aria-label="Copia il link" />
                  </div>
                  {stats?.ultimoAccesso && (
                    <p className="t-nota">Ultimo accesso: {daQuando(stats.ultimoAccesso)}.</p>
                  )}
                  {stato.stato === "sospeso" && (
                    <p className="t-nota">
                      La pagina pubblica è spenta: si riaccende dalle impostazioni avanzate, qui sotto.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {stato.stato === "attivo" && (
                    <Button asChild variant="outline">
                      <a href={portaleUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Apri portale
                      </a>
                    </Button>
                  )}
                  {canManage && (
                    <Button asChild variant="accent">
                      <Link href="/settings/wifi/configura">Gestisci</Link>
                    </Button>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ------------------------------------------------------------ */}
          {/*  Tre numeri, non sei.                                        */}
          {/* ------------------------------------------------------------ */}
          {stats && stats.contatti > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Numero valore={stats.ultimi30} etichetta="Contatti" base="negli ultimi 30 giorni" />
                <Numero
                  valore={stats.conPrenotazione}
                  etichetta="Poi venuti a mangiare"
                  base="hanno almeno una prenotazione"
                />
                <Numero
                  valore={stats.conMarketing}
                  etichetta="Consenso marketing"
                  base="si possono ricontattare"
                />
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 t-nota">
                {/* Il numero onesto è il secondo: un indirizzo email raccolto
                    non è un cliente, ed è un dato di cui risponde il locale. */}
                <span>
                  Il numero che dice se questa cosa serve è «poi venuti a mangiare»: un contatto raccolto non è
                  un cliente.
                </span>
                <Link href="/marketing/wifi" className="inline-flex items-center gap-1 underline">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" /> Vedi chi si è collegato
                </Link>
              </p>
            </>
          )}

          {stats && stats.contatti === 0 && stato.stato === "attivo" && (
            <p className="riquadro comodo flex items-start gap-2 text-sm text-muted-foreground">
              <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {/* I due modi stanno nella carta qui sotto: ripeterli qui
                  vorrebbe dire scrivere la stessa cosa due volte nella stessa
                  schermata. Questa riga dice solo dove guardare. */}
              Nessuno si è ancora collegato. Il portale è acceso: quello che manca è far arrivare i clienti
              alla pagina — le due strade sono qui sotto.
            </p>
          )}

          {/* ------------------------------------------------------------ */}
          {/*  Come funziona il tuo portale, e cosa manca.                 */}
          {/* ------------------------------------------------------------ */}
          {stato.configurato && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-5">
                <ArrivoAlPortale
                  portaleUrl={portaleUrl}
                  collegatoIl={stato.routerCollegatoIl}
                  canManage={canManage}
                />

                <AvanzateWifi
                  iniziale={{
                    redirectUrl: v.wifiRedirectUrl ?? "",
                    couponEnabled: v.wifiAutoCouponEnabled,
                    couponPercent: v.wifiAutoCouponPercent,
                    couponDays: v.wifiAutoCouponDays,
                  }}
                  attivo={stato.stato === "attivo"}
                  canManage={canManage}
                />

                {/*
                  Lo stato della cifratura, detto una volta.

                  Non è un dettaglio tecnico: è la differenza fra «se qualcuno
                  legge una copia del database trova una stringa inutile» e
                  «trova la password della vostra rete». Quando la chiave c'è,
                  è una nota; quando manca, è un avviso — e sta in pagina, non
                  dentro un blocco da aprire.
                */}
                {cifraturaAttiva() ? (
                  <p className="t-nota">
                    La password della rete è salvata cifrata: nel database non c&apos;è il testo leggibile.
                  </p>
                ) : (
                  <p className="riquadro comodo border-accent/40 bg-accent/10 text-sm">
                    La password della rete è salvata in chiaro: questa installazione non ha una chiave di
                    cifratura configurata (CHIAVE_CIFRATURA). Il portale funziona comunque.
                  </p>
                )}
              </div>

              <section className="space-y-3">
                <div>
                  <h2 className="t-titolo-scheda flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Come funziona il tuo
                    portale
                  </h2>
                  <p className="t-nota">Questa è la pagina che apre il cliente.</p>
                </div>
                <AnteprimaPortale dati={anteprima} />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
