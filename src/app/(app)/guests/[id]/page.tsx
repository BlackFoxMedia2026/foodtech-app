import { notFound } from "next/navigation";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  History,
  NotebookPen,
  Phone,
  PieChart,
  Receipt,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCrmOspite } from "@/server/guest-crm";
import { FasciaTessere, TesseraKpi } from "@/components/ui/tessera-kpi";
import { TestataOspite } from "@/components/guests/testata-ospite";
import { FidelityCard } from "@/components/guests/fidelity-card";
import { VisiteChart } from "@/components/guests/visite-chart";
import { NoteServizio } from "@/components/guests/note-servizio";
import { TagEditor } from "@/components/guests/tag-editor";
import {
  AbitudiniCliente,
  CategoriePreferite,
  Cifra,
  ProdottiPreferiti,
  SezioneSpesa,
  StatoPillola,
  StoricoVisite,
} from "@/components/guests/crm-sezioni";
import { can, getActiveVenue } from "@/lib/tenant";
import { statoCentralino } from "@/server/licenza-centralino";
import { chiamateDiOspite } from "@/server/chiamate";
import { TelefonateOspite } from "@/components/telefono/telefonate-ospite";
import { getSaldoFedelta } from "@/server/loyalty";
import { LoyaltyPanel } from "@/components/guests/loyalty-panel";
import { getGuest } from "@/server/guests";
import { assicuraCodiceTessera, qrTessera } from "@/server/tessera-fedelta";
import { formattaCodiceTessera } from "@/lib/tessera";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notaPreferenze } from "@/lib/cosa-sapere";

export const dynamic = "force-dynamic";

/**
 * La scheda cliente: **chi è, quanto torna, quanto spende, cosa compra**.
 *
 * L'ordine è **quanto in fretta serve**:
 *
 * 1. **Chi è** — nome, stato, contatti, allergie: la testata, che si legge in
 *    un secondo mentre la persona è alla porta.
 * 2. **Quanto vale** — quattro tessere nello stile della Panoramica
 *    (`ui/tessera-kpi`): visite, valore storico, spesa media, ultima visita.
 * 3. **La tessera** — un oggetto, non un riquadro: è l'unica cosa in pagina
 *    che il cliente stesso riconoscerebbe.
 * 4. **Cosa fa** — visite nel tempo, spesa e categorie, piatti, abitudini.
 * 5. **Cosa scriviamo di lui** — note e preferenze.
 *
 * ## Le due colonne non sono simmetriche
 *
 * A sinistra le cose che **descrivono** il cliente e stanno ferme: tessera,
 * punti, note. A destra quelle che **cambiano** a ogni visita.
 *
 * ## Revisione del 3 novembre 2026
 *
 * - **Una sola barra di scorrimento.** Le due colonne scorrevano ognuna per
 *   conto suo: due barre affiancate, tessera e card tagliate dal bordo della
 *   colonna. Ora scorre la regione intera, come la Panoramica.
 * - **Ogni numero una volta.** Valore storico e spesa media stavano in cima e
 *   di nuovo nella card Spesa; frequenza e «dall'ultima» in cima e di nuovo in
 *   Visite; «mancano N punti» sotto la tessera e nel pannello punti; il saldo
 *   sulla tessera e nel pannello. Adesso ognuno sta in un posto solo.
 * - **Niente righe di celle.** Le file di etichette in maiuscoletto sopra un
 *   numero, quattro per riga, sembravano un foglio di calcolo: sono diventate
 *   tessere e pastiglie (`Cifra`), con il numero in primo piano.
 * - **Niente testo troncato.** Nomi di piatti, posti, movimenti vanno a capo
 *   invece di finire in «…».
 * - **Via «Cosa ne deduciamo» e «Caparre e pagamenti».** Le etichette dedotte
 *   ripetevano lo stato già scritto in testata e nella card Visite; i
 *   pagamenti si consultano in Pagamenti, non sulla scheda di chi viene a
 *   cena.
 */
export default async function GuestDetail({ params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const g = await getGuest(ctx.venueId, params.id);
  if (!g) notFound();

  const centralino = await statoCentralino(ctx.venueId);
  const [crm, saldo] = await Promise.all([
    getCrmOspite(ctx.venueId, params.id),
    getSaldoFedelta(ctx.venueId, params.id),
  ]);

  /* Le telefonate solo se il locale ha il telefono: `null` significa «questo
     locale non ha il centralino», che è diverso da «nessuna telefonata». */
  const telefonate = centralino.attivo
    ? await chiamateDiOspite(ctx.venueId, g.id)
    : null;

  /* Il numero di tessera si assegna la prima volta che qualcuno guarda questa
     scheda: vedi `server/tessera-fedelta.ts`. */
  const codice = await assicuraCodiceTessera(ctx.venueId, g.id, g.loyaltyCardCode);
  const qr = codice ? await qrTessera(codice) : null;

  const name = `${g.firstName} ${g.lastName ?? ""}`.trim();
  const valuta = ctx.venue.currency;
  const ultima = crm.visite.date.length ? new Date(crm.visite.date.at(-1)!) : null;
  const giorni = (n: number) => `${n} ${n === 1 ? "giorno" : "giorni"}`;

  return (
    <div className="schermo fondo-caldo animate-fade-in gap-4">
      {/* Chi è, come si contatta, che stato ha e cosa ci si può fare: tutto in
          `TestataOspite`. Il perché delle scelte sta lì. */}
      <TestataOspite
        ospite={{
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
          tags: g.tags,
          anonymizedAt: g.anonymizedAt,
        }}
        stato={crm.stato}
        canManage={can(ctx.role, "manage_venue")}
      />

      {/*
        Una regione sola che scorre, come la Panoramica. `-mx-3 px-3 -mb-6
        pb-6` allarga il bordo nel margine di `main` senza spostare le card:
        le ombre hanno dove cadere invece di essere tagliate di netto.
      */}
      <div className="fill -mx-3 -mb-6 min-h-0 space-y-4 overflow-y-auto px-3 pb-6">
        {/* Le quattro domande di chi apre una scheda: quanto viene, quanto ha
            lasciato, quanto lascia per volta, quando l'ultima volta. */}
        <FasciaTessere colonne={4}>
          <TesseraKpi
            icona={CalendarCheck}
            etichetta={["Visita", "Visite"]}
            valore={crm.visite.totali}
            nota={
              crm.visite.totali === 0
                ? "mai venuto"
                : crm.visite.cadenzaGiorni != null
                  ? `una ogni ${giorni(crm.visite.cadenzaGiorni)}`
                  : "la frequenza dalla seconda visita"
            }
          />
          <TesseraKpi
            icona={Wallet}
            etichetta="Valore storico"
            corta="Valore"
            valore={crm.spesa.conti > 0 ? formatCurrency(crm.spesa.totaleCents, valuta) : "—"}
            nota={
              crm.spesa.conti > 0
                ? `incassato su ${crm.spesa.conti} ${crm.spesa.conti === 1 ? "conto chiuso" : "conti chiusi"}`
                : "nessun conto chiuso"
            }
          />
          <TesseraKpi
            icona={Receipt}
            etichetta="Spesa media"
            corta="Media"
            valore={
              crm.spesa.mediaContoCents != null ? formatCurrency(crm.spesa.mediaContoCents, valuta) : "—"
            }
            nota={crm.spesa.conti > 0 ? "per conto" : "nessun conto chiuso"}
          />
          <TesseraKpi
            icona={CalendarClock}
            etichetta="Ultima visita"
            corta="Ultima"
            valore={ultima ? formatDate(ultima, "it-IT", ctx.venue.timezone) : "—"}
            nota={
              crm.visite.giorniDaUltima == null
                ? "nessuna visita"
                : crm.visite.giorniDaUltima === 0
                  ? "oggi"
                  : `${giorni(crm.visite.giorniDaUltima)} fa`
            }
          />
        </FasciaTessere>

        <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0 xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
          {/* ------------------------------------------- colonna: chi è, ferma */}
          <div className="space-y-4">
            {/* «Mancano N punti» sta nel pannello qui sotto: sulla tessera e
                nel pannello era la stessa frase due volte. */}
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
              premio={null}
            />

            {/* La carta e il suo estratto conto: il saldo si legge sulla
                carta, qui il traguardo e i movimenti. */}
            <LoyaltyPanel
              guestId={g.id}
              guestName={g.firstName}
              saldo={saldo}
              currency={valuta}
              canAdjust={can(ctx.role, "manage_venue")}
              saldoSullaTessera
            />

            <Card id="note" className="card-notch">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Note e preferenze
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <NoteServizio
                  guestId={g.id}
                  allergies={g.allergies}
                  preferenze={notaPreferenze(g.preferences)}
                  privateNotes={g.privateNotes}
                />

                {/* Un tag è una cosa che il locale scrive sul cliente, come le
                    note: in testata si legge, qui si scrive. */}
                <div className="space-y-2 border-t border-border pt-4">
                  <p className="text-sm font-medium">Etichette</p>
                  <TagEditor guestId={g.id} tags={g.tags} />
                </div>
              </CardContent>
            </Card>

          </div>

          {/* --------------------------------------- colonna: cosa fa, cambia */}
          <div className="space-y-4">
            {/*
              Lo stato in testa alla card, il suo perché scritto per esteso,
              le due cifre che in cima non ci sono e il grafico. Frequenza e
              «dall'ultima» non si ripetono: sono nelle tessere sopra.
            */}
            <Card className="card-notch">
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <History className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Visite nel locale
                </CardTitle>
                <StatoPillola stato={crm.stato} />
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">{crm.stato.perche}</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <Cifra
                    valore={crm.visite.ultimi30}
                    etichetta={`${crm.visite.ultimi30 === 1 ? "visita" : "visite"} negli ultimi 30 giorni`}
                  />
                  <Cifra
                    valore={crm.visite.ultimi90}
                    etichetta={`${crm.visite.ultimi90 === 1 ? "visita" : "visite"} negli ultimi 90 giorni`}
                  />
                </div>
                <VisiteChart date={crm.visite.date} />
              </CardContent>
            </Card>

            {/* «Quanto spende» e «in cosa» nella stessa card; accanto i piatti.
                Affiancate da `xl`, dove ognuna ha almeno 380 px. */}
            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
              <Card className="card-notch">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Spesa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <SezioneSpesa spesa={crm.spesa} visite={crm.visite.totali} currency={valuta} />
                  {crm.spesa.conti > 0 && (
                    <div className="space-y-3 border-t border-border pt-4">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <PieChart className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Dove vanno i
                        soldi
                      </p>
                      <CategoriePreferite categorie={crm.categorie} currency={valuta} />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="card-notch">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UtensilsCrossed className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Piatti
                    preferiti
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProdottiPreferiti prodotti={crm.prodotti} currency={valuta} />
                </CardContent>
              </Card>
            </div>

            <Card className="card-notch">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Abitudini
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AbitudiniCliente abitudini={crm.abitudini} />
              </CardContent>
            </Card>

            <Card className="card-notch">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Storico visite
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StoricoVisite visite={crm.storico} currency={valuta} timeZone={ctx.venue.timezone} />
              </CardContent>
            </Card>

            {/* Solo se il locale ha il telefono collegato: «nessuna
                telefonata» su un locale senza centralino non significa
                niente. */}
            {telefonate !== null && (
              <Card className="card-notch">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Telefonate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TelefonateOspite chiamate={telefonate} />
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
