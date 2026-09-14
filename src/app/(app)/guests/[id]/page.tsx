import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Cake,
  CreditCard,
  Download,
  History,
  Mail,
  NotebookPen,
  Phone,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGuestProfile } from "@/server/guest-intelligence";
import { getCrmOspite } from "@/server/guest-crm";
import { Badge } from "@/components/ui/badge";
import { Etichetta } from "@/components/ui/etichetta";
import { Base } from "@/components/ui/base-del-numero";
import { Blocco } from "@/components/ui/blocco";
import { Button } from "@/components/ui/button";
import { LoyaltyPill } from "@/components/guests/loyalty-pill";
import { EditGuestDialog } from "@/components/guests/edit-guest-dialog";
import { TagEditor } from "@/components/guests/tag-editor";
import { FidelityCard } from "@/components/guests/fidelity-card";
import { VisiteChart } from "@/components/guests/visite-chart";
import { NoteServizio } from "@/components/guests/note-servizio";
import {
  AbitudiniCliente,
  CategoriePreferite,
  Dato,
  ProdottiPreferiti,
  SezioneSpesa,
  StatoPillola,
  StoricoVisite,
} from "@/components/guests/crm-sezioni";
import { can, getActiveVenue } from "@/lib/tenant";
import { getSaldoFedelta } from "@/server/loyalty";
import { LoyaltyPanel } from "@/components/guests/loyalty-panel";
import { ErasureDialog } from "@/components/guests/erasure-dialog";
import { getGuest } from "@/server/guests";
import { assicuraCodiceTessera, qrTessera } from "@/server/tessera-fedelta";
import { formattaCodiceTessera } from "@/lib/tessera";
import { formatCurrency, formatDate, formatDateTime, initials } from "@/lib/utils";
import { notaPreferenze } from "@/lib/cosa-sapere";

export const dynamic = "force-dynamic";

const PAYMENT_KIND_LABEL = {
  DEPOSIT: "Caparra",
  PREAUTH: "Preautorizzazione",
  TICKET: "Ticket",
  REFUND: "Rimborso",
  PACKAGE: "Pacchetto",
} as const;

const PAYMENT_STATUS_TONE = {
  PENDING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
} as const;

/**
 * La scheda cliente: **chi è, quanto torna, quanto spende, cosa compra**.
 *
 * ## Cos'era
 *
 * Undici riquadri in due colonne, tutti della stessa forma e dello stesso
 * peso: contatti, preferenze, note, punti, movimenti, profilo, cronologia,
 * storico. Per sapere se un cliente stava smettendo di venire si leggevano
 * tutti e undici e si tirava la somma a mente — ammesso che il dato ci fosse,
 * perché la spesa e i piatti non c'erano affatto.
 *
 * ## Com'è organizzata adesso
 *
 * L'ordine non è alfabetico né cronologico: è **quanto in fretta serve**.
 *
 * 1. **Chi è** — nome, stato, contatti, allergie: la testata, che si legge in
 *    un secondo mentre la persona è alla porta.
 * 2. **Quanto vale** — quattro numeri, e nient'altro. Quattro e non dieci: un
 *    cruscotto da dieci numeri non ha un primo numero, e questo ce l'ha.
 * 3. **La tessera** — un oggetto, non un riquadro: è l'unica cosa in pagina
 *    che il cliente stesso riconoscerebbe.
 * 4. **Cosa fa** — visite nel tempo, spesa, piatti, abitudini: le analisi, in
 *    ordine di quanto spesso si guardano.
 * 5. **Cosa scriviamo di lui** — note e preferenze, in fondo, perché è dove si
 *    scrive e non dove si legge di corsa.
 *
 * ## Le due colonne non sono simmetriche
 *
 * A sinistra le cose che **descrivono** il cliente e stanno ferme: tessera,
 * abitudini, note. A destra quelle che **cambiano** a ogni visita: il grafico,
 * la spesa, i piatti, lo storico. Una pagina di riquadri uguali disposti a
 * griglia non direbbe quale guardare per primo; questa sì.
 */
export default async function GuestDetail({ params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const g = await getGuest(ctx.venueId, params.id);
  if (!g) notFound();

  const [profile, crm, saldo] = await Promise.all([
    getGuestProfile(ctx.venueId, params.id),
    getCrmOspite(ctx.venueId, params.id),
    getSaldoFedelta(ctx.venueId, params.id),
  ]);

  /*
    Il numero di tessera si assegna qui, la prima volta che qualcuno guarda
    questa scheda. Vedi `server/tessera-fedelta.ts`: generare un codice per
    tutti e sessantacinque i clienti dell'archivio vorrebbe dire mantenere
    unici sessantaquattro identificativi che nessuno userà mai.
  */
  const codice = await assicuraCodiceTessera(ctx.venueId, g.id, g.loyaltyCardCode);
  const qr = codice ? await qrTessera(codice) : null;

  const name = `${g.firstName} ${g.lastName ?? ""}`.trim();
  const valuta = ctx.venue.currency;

  return (
    <div className="schermo animate-fade-in gap-4">
      <Button asChild variant="ghost" size="sm" className="fissa self-start">
        <Link href="/guests"><ArrowLeft className="h-4 w-4" /> CRM ospiti</Link>
      </Button>

      {/* ------------------------------------------------------------ testata */}
      <header className="fissa flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="text-display text-2xl leading-tight md:text-3xl">{name}</h1>

            {/*
              Lo stato del cliente sta accanto al nome, prima di tutto il
              resto: è l'unica cosa in questa testata che dice **cosa fare**.
              «Da riattivare» accanto a un nome è una decisione; in fondo alla
              pagina, dentro un riquadro, è una statistica.
            */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatoPillola stato={crm.stato} />
              <LoyaltyPill tier={g.loyaltyTier} />
              {g.anonymizedAt && (
                <Badge tone="neutral" className="text-muted-foreground">
                  dati cancellati su richiesta
                </Badge>
              )}
              {/* Un'allergia non è un tag: è un fatto che cambia il servizio
                  adesso. Forma quadrata e icona — il linguaggio dei segnali —
                  così non si legge come «VIP», che è un'opinione. */}
              {g.allergies && (
                <Etichetta linguaggio="segnale" icona={AlertTriangle}>
                  {g.allergies}
                </Etichetta>
              )}
            </div>

            {/*
              I contatti stanno nella testata e non in un riquadro tutto loro.

              Erano una card da sola in cima alla colonna sinistra, con tre
              righe dentro e trecento pixel di vuoto sotto: una scheda intera
              per due stringhe che si leggono insieme al nome. Qui stanno sulla
              riga sotto, dove si guardano — perché chi cerca il telefono di
              qualcuno lo cerca mentre legge il nome, non dopo aver scorso.
            */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
              {g.email && (
                <a
                  href={`mailto:${g.email}`}
                  className="flex items-center gap-1.5 hover:text-accent-strong"
                >
                  <Mail className="h-3.5 w-3.5 text-tertiary-foreground" aria-hidden="true" />
                  {g.email}
                </a>
              )}
              {g.phone && (
                <a href={`tel:${g.phone}`} className="flex items-center gap-1.5 hover:text-accent-strong">
                  <Phone className="h-3.5 w-3.5 text-tertiary-foreground" aria-hidden="true" />
                  <span className="tabular-nums">{g.phone}</span>
                </a>
              )}
              {g.birthday && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Cake className="h-3.5 w-3.5 text-tertiary-foreground" aria-hidden="true" />
                  <span className="tabular-nums">{formatDate(g.birthday)}</span>
                </span>
              )}
              <span className="text-tertiary-foreground">
                {g.marketingOptIn ? "iscritto alle comunicazioni" : "non iscritto alle comunicazioni"}
              </span>
            </div>

            <div className="mt-3">
              <TagEditor guestId={g.id} tags={g.tags} />
            </div>
          </div>
        </div>

        {/*
          Tre azioni, non quindici. «Modifica ospite» è quella che si usa; le
          altre due sono operazioni sui dati personali e stanno dietro il
          permesso del manager — cancellare i dati di una persona non è un
          gesto da fare di corsa fra due tavoli.
        */}
        {/* `shrink-0` vale solo da `sm`: sul telefono i tre pulsanti sono più
            larghi dello schermo, e un gruppo che non si restringe li spingeva
            fuori a destra — «Modifica» finiva tagliato a metà. Da lì in giù
            prendono una riga tutta loro e vanno a capo fra di sé. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {can(ctx.role, "manage_venue") && (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/guests/${g.id}/export`} download>
                <Download className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Esporta i dati
              </a>
            </Button>
          )}
          {can(ctx.role, "manage_venue") && !g.anonymizedAt && (
            <ErasureDialog guestId={g.id} guestName={name} />
          )}
          <EditGuestDialog
            guest={{
              id: g.id,
              firstName: g.firstName,
              lastName: g.lastName,
              email: g.email,
              phone: g.phone,
              birthday: g.birthday,
              loyaltyTier: g.loyaltyTier,
              allergies: g.allergies,
              privateNotes: g.privateNotes,
              marketingOptIn: g.marketingOptIn,
              preferences: g.preferences,
            }}
          />
        </div>
      </header>

      {/* --------------------------------------------------------------- KPI */}
      {/*
        Quattro numeri, e il quarto è una data.

        Sono le quattro domande che si fa chi apre una scheda cliente: quanto
        viene, quanto ha lasciato, quanto lascia per volta, quando l'ultima
        volta. Non è una fascia di sei come in Servizio — lì si guardano
        mentre si cammina, qui si leggono stando fermi — quindi stanno in una
        riga sola, senza dischetti e senza tinte: il numero e la sua base.

        Il motivo dello stato («viene ogni 18 giorni, ne sono passati 62») sta
        sotto l'ultima visita, perché è lì che si spiega: è la differenza fra
        le due date che fa lo stato in testata.
      */}
      <section
        aria-label="I numeri di questo cliente"
        className="fissa riquadro grid grid-cols-2 gap-x-6 gap-y-5 bg-card-sunken p-4 md:grid-cols-4"
      >
        <Dato
          etichetta="Visite totali"
          valore={crm.visite.totali || null}
          vuoto="mai venuto"
          nota={
            crm.visite.cadenzaGiorni != null
              ? `una ogni ${crm.visite.cadenzaGiorni} ${crm.visite.cadenzaGiorni === 1 ? "giorno" : "giorni"}`
              : undefined
          }
          grande
        />
        <Dato
          etichetta="Valore storico"
          valore={crm.spesa.conti > 0 ? formatCurrency(crm.spesa.totaleCents, valuta) : null}
          vuoto="nessun conto chiuso"
          nota={
            crm.spesa.conti > 0 ? (
              <Base
                base="misurato"
                dettaglio={`Somma di ${crm.spesa.conti} conti chiusi a nome di questa persona. Non è una previsione: è quello che è entrato in cassa.`}
              />
            ) : undefined
          }
          grande
        />
        <Dato
          etichetta="Spesa media"
          valore={
            crm.spesa.mediaContoCents != null
              ? formatCurrency(crm.spesa.mediaContoCents, valuta)
              : null
          }
          nota={`su ${crm.spesa.conti} ${crm.spesa.conti === 1 ? "conto" : "conti"}`}
          grande
        />
        <Dato
          etichetta="Ultima visita"
          valore={crm.visite.date.length ? formatDate(new Date(crm.visite.date.at(-1)!)) : null}
          vuoto="—"
          nota={
            crm.visite.giorniDaUltima != null
              ? crm.visite.giorniDaUltima === 0
                ? "oggi"
                : `${crm.visite.giorniDaUltima} ${crm.visite.giorniDaUltima === 1 ? "giorno" : "giorni"} fa`
              : undefined
          }
          grande
        />
      </section>

      {/* ------------------------------------------------------------- corpo */}
      {/*
        Le due colonne scorrono **dentro di sé**, e per riuscirci devono
        ricevere un'altezza: quindi niente `items-start`. Con l'allineamento in
        alto ogni colonna si dimensiona sul proprio contenuto, `min-h-0` non ha
        più niente da limitare, e le due colonne crescono oltre la regione —
        che, essendo `overflow-hidden` da `lg`, le taglia. Il risultato era il
        fondo della pagina irraggiungibile su scrivania: lo storico visite
        c'era, ma non si poteva arrivarci.
      */}
      <div className="fill min-h-0 space-y-6 overflow-y-auto pr-0.5 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-6 lg:space-y-0 lg:overflow-hidden">
        {/* ------------------------------------------- colonna: chi è, ferma */}
        <div className="space-y-6 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          <FidelityCard
            nome={name}
            venue={ctx.venue.name}
            tier={g.loyaltyTier}
            codice={codice ? formattaCodiceTessera(codice) : null}
            qrDataUrl={qr}
            punti={saldo.punti}
            valoreCents={saldo.valoreCents}
            iscrittoIl={g.createdAt}
            currency={valuta}
            premio={saldo.alPremio}
          />

          {/* La tessera e i suoi movimenti sono lo stesso oggetto: la carta e
              l'estratto conto. Per questo stanno attaccati. */}
          <LoyaltyPanel
            guestId={g.id}
            guestName={g.firstName}
            saldo={saldo}
            currency={valuta}
            canAdjust={can(ctx.role, "manage_venue")}
          />

          <Card id="note">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Note e preferenze
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NoteServizio
                guestId={g.id}
                allergies={g.allergies}
                preferenze={notaPreferenze(g.preferences)}
                privateNotes={g.privateNotes}
              />
            </CardContent>
          </Card>

          {/* Chiuso: i movimenti si guardano quando si cerca un pagamento, non
              ogni volta che si apre una scheda. Da chiuso dice quanti sono. */}
          <Blocco
            titolo="Caparre e pagamenti"
            icona={CreditCard}
            valore={
              g.payments.length === 0
                ? "nessuno"
                : `${g.payments.length} ${g.payments.length === 1 ? "movimento" : "movimenti"}`
            }
          >
            {g.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun pagamento registrato.</p>
            ) : (
              <ul className="divide-y">
                {g.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{PAYMENT_KIND_LABEL[p.kind]}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{formatCurrency(p.amountCents, p.currency)}</span>
                      <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{p.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Blocco>
        </div>

        {/* --------------------------------------- colonna: cosa fa, cambia */}
        <div className="space-y-6 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Visite nel locale
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
                <Dato etichetta="Ultimi 30 giorni" valore={crm.visite.ultimi30} />
                <Dato etichetta="Ultimi 90 giorni" valore={crm.visite.ultimi90} />
                <Dato
                  etichetta="Frequenza"
                  valore={
                    crm.visite.cadenzaGiorni != null ? `ogni ${crm.visite.cadenzaGiorni} gg` : null
                  }
                  vuoto="serve più di una visita"
                />
                <Dato
                  etichetta="Dall'ultima"
                  valore={
                    crm.visite.giorniDaUltima != null ? `${crm.visite.giorniDaUltima} gg` : null
                  }
                />
              </div>

              {/* Il motivo dello stato, scritto per esteso: è qui che i due
                  numeri sopra diventano un giudizio, quindi è qui che va
                  spiegato come. */}
              <p className="flex items-start gap-2 rounded-md border border-border bg-card-sunken p-3 text-sm text-muted-foreground">
                <StatoPillola stato={crm.stato} />
                <span>{crm.stato.perche}</span>
              </p>

              <VisiteChart date={crm.visite.date} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Spesa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SezioneSpesa spesa={crm.spesa} visite={crm.visite.totali} currency={valuta} />
            </CardContent>
          </Card>

          {/*
            Piatti e categorie affiancati: sono la stessa domanda a due
            ingrandimenti diversi — cosa ordina, e di che genere. Separarli in
            due schede a tutta larghezza li avrebbe fatti leggere come due
            argomenti, e uno dei due sarebbe finito sotto la piega.
          */}
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Prodotti
                  preferiti
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProdottiPreferiti prodotti={crm.prodotti} currency={valuta} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Categorie preferite</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoriePreferite categorie={crm.categorie} currency={valuta} />
              </CardContent>
            </Card>
          </div>

          {/*
            Le abitudini stanno nella colonna larga, non accanto alla tessera.

            Sono sei voci con etichette lunghe — «permanenza media», «fascia
            oraria» — e nella colonna da 22 rem entravano in tre colonne da
            centoquindici pixel: l'etichetta andava a capo e il valore si
            troncava, «Sala principale · B2» diventava «Sala princ…». È
            esattamente la colonna microscopica che questa pagina doveva
            togliere. Qui la riga è larga il triplo e nessun valore si taglia.
          */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Abitudini
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AbitudiniCliente abitudini={crm.abitudini} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Storico visite</CardTitle>
            </CardHeader>
            <CardContent>
              <StoricoVisite visite={crm.storico} currency={valuta} />
            </CardContent>
          </Card>

          {/*
            Le etichette dedotte chiudono la colonna.

            Sono deduzioni — «abituale» sono quattro visite, «a rischio» sono
            sessanta giorni di silenzio: soglie scelte da noi, che possono
            sbagliarsi. Stavano in cima, dove si leggevano come fatti; qui
            stanno dopo i fatti, che è l'ordine giusto per qualcosa che va
            letto sapendo che è un'opinione del software. Il perché resta nel
            suggerimento.
          */}
          {profile && profile.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cosa ne deduciamo</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {profile.tags.map((t) => (
                  <Etichetta key={t.key} linguaggio={t.linguaggio} perche={t.why}>
                    {t.label}
                  </Etichetta>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
