import Link from "next/link";
import { CalendarX, ChevronRight, Hourglass, PhoneCall, Repeat, RotateCw, Timer, UserX, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spiega } from "@/components/insights/spiega";
import { durataUmana } from "@/lib/durata";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import {
  ASSENZE_CHE_CONTANO,
  GIORNI_AVANTI_RISCHIO,
  MINIMO_PER_QUOTA,
  giornoConArticolo,
  type NoShowReport,
} from "@/server/no-show";
import { MINIMO_MISURATE, type RotazioneReport } from "@/server/rotazione";
import type { WaitlistReport } from "@/server/waitlist";

/**
 * La vista «Servizio» (18 nov 2026).
 *
 * Erano tre pannelli in colonna, ognuno con tre riquadri di numeri, una nota
 * e un paragrafo: la cosa più utile — chi chiamare il giorno prima — stava in
 * fondo al primo, sotto sette righe di barre. Adesso la cosa da fare sta in
 * cima, accanto ai numeri delle assenze; durata e lista d'attesa sotto, in
 * due riquadri affiancati. Le regole del calcolo sono dietro la «i».
 */
export function VistaServizio({
  assenze,
  rotazione,
  coda,
  currency,
}: {
  assenze: NoShowReport;
  rotazione: RotazioneReport;
  coda: WaitlistReport;
  currency: string;
}) {
  const euro = (c: number) => formatCurrency(c, currency);
  return (
    <>
      <section className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Assenze r={assenze} euro={euro} />
        <DaChiamare r={assenze} />
      </section>
      <section className="grid gap-3 md:gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <ATavola r={rotazione} />
        <Coda r={coda} />
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pezzi comuni                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Un numero con la sua icona, in una piccola tessera: lo stesso dischetto
 * verde delle tessere in cima, così i numeri non galleggiano nella card.
 * Solo verde e oro: un numero «brutto» si accende nell'oro che si legge, non
 * in rosso — il rosso non è nella tavolozza del prodotto.
 */
function Numero({
  valore,
  etichetta,
  icona: Icona,
  tono,
}: {
  valore: string;
  etichetta: string;
  icona: React.ComponentType<{ className?: string; stroke?: string }>;
  tono?: "oro" | "verde";
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-card/60 p-3 ring-1 ring-inset ring-border/60">
      <span className="vetro kpi-pastiglia hidden h-10 w-10 shrink-0 place-items-center rounded-full sm:grid">
        <Icona className="h-5 w-5" stroke="url(#trattoVetro)" />
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "whitespace-nowrap font-mono text-base leading-none tabular-nums sm:text-2xl",
            tono === "oro" ? "text-accent-strong" : tono === "verde" ? "text-sage-strong" : "text-foreground",
          )}
        >
          {valore}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{etichetta}</p>
      </div>
    </div>
  );
}

function Testata({
  titolo,
  sotto,
  spiega,
}: {
  titolo: string;
  sotto?: React.ReactNode;
  spiega?: React.ReactNode;
}) {
  return (
    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
      <div>
        <CardTitle>{titolo}</CardTitle>
        {sotto && <CardDescription>{sotto}</CardDescription>}
      </div>
      {spiega && <Spiega titolo="Come si misura">{spiega}</Spiega>}
    </CardHeader>
  );
}

/* -------------------------------------------------------------------------- */
/*  Le assenze                                                                 */
/* -------------------------------------------------------------------------- */

/** Lunedì per primo: è la settimana di chi lavora in sala. */
const ordineSettimana = (w: number) => (w + 6) % 7;

function Assenze({ r, euro }: { r: NoShowReport; euro: (c: number) => string }) {
  if (r.prenotazioni === 0 || r.assenze === 0) {
    return (
      <Card className="card-notch">
        <Testata titolo="Le assenze" />
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {r.prenotazioni === 0
              ? "Nessuna prenotazione nel periodo."
              : `Nessuna assenza su ${r.prenotazioni} ${r.prenotazioni === 1 ? "prenotazione" : "prenotazioni"}: niente da recuperare.`}
          </p>
        </CardContent>
      </Card>
    );
  }

  const giorni = [...r.perGiorno].sort((a, b) => ordineSettimana(a.weekday) - ordineSettimana(b.weekday));
  const massimo = Math.max(1, ...giorni.map((g) => g.quota ?? 0));
  const peggiore = r.giornoPeggiore?.weekday;

  return (
    <Card className="card-notch flex flex-col">
      <Testata
        titolo="Le assenze"
        sotto={
          <>
            {r.assenze} {r.assenze === 1 ? "prenotazione andata" : "prenotazioni andate"} a vuoto su {r.prenotazioni}
            {r.quota != null ? ` · il ${r.quota}%` : ""}
          </>
        }
        spiega={
          <>
            <p>
              {r.valoreCoperto.tipo === "misurato"
                ? `Un coperto vale ${euro(r.valoreCoperto.centesimi)}: è misurato sui ${r.valoreCoperto.suContiChiusi} conti chiusi del periodo, non stimato.`
                : r.valoreCoperto.tipo === "dichiarato"
                  ? `Un coperto vale ${euro(r.valoreCoperto.centesimi)}, dallo scontrino medio che hai dichiarato: è una stima, e diventa una misura appena ci sono conti chiusi nel periodo.`
                  : "Manca lo scontrino medio: senza quello i coperti persi non hanno un valore in euro. Si dichiara in Impostazioni, o si misura chiudendo i conti al tavolo."}
            </p>
            <p>
              Le percentuali per giorno compaiono solo dove ci sono almeno {MINIMO_PER_QUOTA} prenotazioni: su
              numeri più piccoli direbbero più di quello che sanno.
            </p>
          </>
        }
      />
      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Numero icona={UserX} valore={String(r.copertiPersi)} etichetta="coperti persi" />
          <Numero
            icona={Wallet}
            valore={r.costoCents != null ? euro(r.costoCents) : "—"}
            etichetta={r.valoreCoperto.tipo === "dichiarato" ? "persi, stimati" : "di incasso perso"}
            tono="oro"
          />
          <Numero
            icona={Repeat}
            valore={String(r.recidiviTotali)}
            etichetta={r.recidiviTotali === 1 ? "cliente recidivo" : "clienti recidivi"}
          />
        </div>

        {/* La settimana in sette colonne: dove succede, a colpo d'occhio. La
            linea tratteggiata è la media: si vede subito chi sta sopra. */}
        <div className="flex flex-1 flex-col">
          {r.quota != null && r.quota > 0 && (
            <p className="flex items-center justify-end gap-1.5 text-[11px] text-sage-strong">
              <span className="w-4 border-t border-dashed border-sage-strong/70" aria-hidden="true" />
              media {r.quota}%
            </p>
          )}
          <div className="relative flex min-h-28 flex-1 items-end gap-2 border-b border-border/70 pt-6">
            {r.quota != null && r.quota > 0 && (
              <div
                className="pointer-events-none absolute inset-x-0 z-0 border-t border-dashed border-sage-strong/50"
                style={{ bottom: `calc((100% - 1.5rem) * ${r.quota / massimo})` }}
                aria-hidden="true"
              >
              </div>
            )}
            {giorni.map((g) => {
              const h = g.assenze === 0 ? 0 : g.quota != null ? Math.max(6, (g.quota / massimo) * 100) : 6;
              const scelto = g.weekday === peggiore;
              return (
                <div key={g.weekday} className="relative z-10 flex h-full flex-1 items-end justify-center">
                  {h > 0 && (
                    <span
                      className={cn(
                        "relative w-full max-w-11 rounded-t-lg bg-gradient-to-t",
                        scelto ? "from-accent-strong to-accent" : "from-accent/55 to-accent/30",
                      )}
                      style={{ height: `${h}%` }}
                      title={`${g.nome}: ${g.assenze} ${g.assenze === 1 ? "assenza" : "assenze"} su ${g.prenotazioni}`}
                    >
                      <span
                        className={cn(
                          "absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] tabular-nums",
                          scelto ? "font-semibold text-accent-strong" : "text-muted-foreground",
                        )}
                      >
                        {g.quota != null ? `${g.quota}%` : g.assenze}
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-2">
            {giorni.map((g) => (
              <span
                key={g.weekday}
                className={cn(
                  "flex-1 text-center text-xs capitalize",
                  g.weekday === peggiore ? "font-semibold text-accent-strong" : "text-muted-foreground",
                )}
              >
                {g.nome.slice(0, 3)}
              </span>
            ))}
          </div>
          {r.giornoPeggiore && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-accent-strong/10 px-3.5 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-strong/15 text-accent-strong">
                <CalendarX className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="text-sm leading-snug">
                <span className="font-semibold text-card-foreground">
                  {maiuscola(giornoConArticolo(r.giornoPeggiore.nome))} è il giorno peggiore
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {r.giornoPeggiore.quota}% di assenze, contro il {r.quota}% di media
                </span>
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chi chiamare                                                               */
/* -------------------------------------------------------------------------- */

function DaChiamare({ r }: { r: NoShowReport }) {
  const nessuno = r.aRischioTotali === 0;
  return (
    <Card className="card-notch flex flex-col">
      <CardHeader className="flex-row items-start gap-3 space-y-0 pb-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-strong/15 text-accent-strong">
          <PhoneCall className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle>Da chiamare il giorno prima</CardTitle>
          <CardDescription>
            {nessuno
              ? `Nei prossimi ${GIORNI_AVANTI_RISCHIO} giorni nessuna prenotazione di clienti già mancati`
              : `${r.aRischioTotali} ${r.aRischioTotali === 1 ? "prenotazione" : "prenotazioni"} nei prossimi ${GIORNI_AVANTI_RISCHIO} giorni, ${r.aRischioCoperti} coperti, di clienti già mancati ${ASSENZE_CHE_CONTANO}+ volte`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {nessuno ? (
          <p className="text-sm text-muted-foreground">Niente da fare: chi ha prenotato si è sempre presentato.</p>
        ) : (
          <>
            <ul className="-mx-2 divide-y divide-border/60">
              {r.aRischio.map((p) => (
                <li key={p.bookingId}>
                  <Link
                    href={`/bookings/${p.bookingId}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-card-foreground">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {quando(p.quando)} · {p.partySize} {p.partySize === 1 ? "coperto" : "coperti"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-accent-strong/15 px-2 py-0.5 text-xs font-medium text-accent-strong">
                      {p.assenze} assenze
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            {r.aRischioTotali > r.aRischio.length && (
              <Link
                href="/bookings"
                className="mt-auto pt-3 text-sm font-medium text-accent-strong underline decoration-accent-strong/40 underline-offset-4"
              >
                e altre {r.aRischioTotali - r.aRischio.length} nelle prenotazioni
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Quanto stanno a tavola                                                     */
/* -------------------------------------------------------------------------- */

function ATavola({ r }: { r: RotazioneReport }) {
  const spiega = (
    <p>
      Misurato su chi si è seduto e ha chiuso il conto: {r.misurate} {r.misurate === 1 ? "prenotazione" : "prenotazioni"}{" "}
      su {r.sedute} con l&apos;ora di arrivo segnata. Chi viene accomodato senza toccare Tavolo, o un conto chiuso a
      voce, qui non c&apos;è. La durata delle prenotazioni nuove la misura Tavolo da sola, per gruppo e per fascia.
    </p>
  );

  if (!r.abbastanza || r.durataMediaMin == null || r.durataPrevistaMin == null) {
    return (
      <Card className="card-notch">
        <Testata titolo="Quanto stanno a tavola" spiega={spiega} />
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Ancora presto per dirlo: servono almeno {MINIMO_MISURATE} cene con arrivo e conto chiuso, qui{" "}
            {r.misurate === 0 ? "non ce n'è nessuna" : r.misurate === 1 ? "ce n'è una" : `ce ne sono ${r.misurate}`}.
          </p>
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(r.durataMediaMin, r.durataPrevistaMin);
  const scarto = r.durataMediaMin - r.durataPrevistaMin;

  return (
    <Card className="card-notch">
      <Testata titolo="Quanto stanno a tavola" sotto={`Su ${r.misurate} cene misurate`} spiega={spiega} />
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {[
            { nome: "Durata vera", min: r.durataMediaMin, colore: "bg-[color:var(--trend-line)]" },
            { nome: "Prevista", min: r.durataPrevistaMin, colore: "bg-accent/60" },
          ].map((x) => (
            <li key={x.nome} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3 whitespace-nowrap text-sm">
              <span className="text-muted-foreground">{x.nome}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-border/50">
                <span className={cn("block h-full rounded-full", x.colore)} style={{ width: `${(x.min / max) * 100}%` }} />
              </span>
              <span className="text-right font-mono tabular-nums text-foreground">{durataUmana(x.min)}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Numero
            icona={RotateCw}
            valore={r.giri == null ? "—" : formatNumber(r.giri)}
            etichetta={r.tavoliUsati === 0 ? "giri: nessun tavolo segnato" : `giri per tavolo, su ${r.tavoliUsati} tavoli`}
          />
          <Numero
            icona={Timer}
            valore={Math.abs(scarto) < 10 ? "In linea" : `${scarto > 0 ? "+" : "−"}${durataUmana(Math.abs(scarto))}`}
            etichetta={
              Math.abs(scarto) < 10
                ? "le cene durano quanto previsto"
                : scarto > 0
                  ? "più del previsto: i tavoli si liberano tardi"
                  : "meno del previsto: i tavoli restano vuoti"
            }
            tono={Math.abs(scarto) < 10 ? "verde" : "oro"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  La lista d'attesa                                                          */
/* -------------------------------------------------------------------------- */

function Coda({ r }: { r: WaitlistReport }) {
  const spiega = (
    <>
      <p>
        Si conta chi è uscito dalla coda nel periodo: chi sta aspettando adesso non è né un successo né una perdita.
        I coperti recuperati sono persone che senza la lista sarebbero andate altrove.
      </p>
      {r.conversione == null && r.chiuse > 0 && (
        <p>Con così poche righe non diamo una percentuale: {r.chiuse} persone non fanno un tasso.</p>
      )}
    </>
  );

  if (r.chiuse === 0 && r.maiChiuse === 0) {
    return (
      <Card className="card-notch">
        <Testata titolo="La lista d'attesa" spiega={spiega} />
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nessuno in coda nel periodo. Quando il locale è pieno, chi arriva senza prenotazione può entrare in lista
            invece di andarsene.
          </p>
        </CardContent>
      </Card>
    );
  }

  const quota = r.chiuse > 0 ? (r.sedute / r.chiuse) * 100 : 0;

  return (
    <Card className="card-notch">
      <Testata
        titolo="La lista d'attesa"
        sotto={`${r.chiuse} ${r.chiuse === 1 ? "persona uscita" : "persone uscite"} dalla coda`}
        spiega={spiega}
      />
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Si sono sedute</span>
            <span className="font-mono tabular-nums text-foreground">
              {r.sedute} su {r.chiuse}
              {r.conversione != null && (
                <span className="ml-1.5 text-muted-foreground">· {Math.round(r.conversione * 100)}%</span>
              )}
            </span>
          </div>
          <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-accent/30">
            <span className="h-full rounded-full bg-sage-strong" style={{ width: `${quota}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {r.andateVia} {r.andateVia === 1 ? "se n'è andata" : "se ne sono andate"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Numero icona={Users} valore={String(r.copertiRecuperati)} etichetta="coperti recuperati" tono={r.copertiRecuperati > 0 ? "verde" : undefined} />
          <Numero
            icona={Hourglass}
            valore={r.attesaMediaMin != null ? durataUmana(r.attesaMediaMin) : "—"}
            etichetta="attesa media prima di sedersi"
          />
        </div>
        {r.maiChiuse > 0 && (
          <p className="rounded-xl bg-accent-strong/10 px-3 py-2 text-xs text-card-foreground">
            {r.maiChiuse === 1 ? "Una riga è rimasta aperta" : `${r.maiChiuse} righe sono rimaste aperte`} per ore:
            chiudila dalla lista d&apos;attesa e i numeri diventano veri.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/** Giorno e ora, corti: «gio 11 set, 20:30». */
function quando(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

function maiuscola(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
