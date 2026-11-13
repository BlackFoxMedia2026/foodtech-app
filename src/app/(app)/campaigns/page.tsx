import Link from "next/link";
import { CalendarCheck, Mail, MailOpen, Megaphone, PencilLine, Plus, Send } from "lucide-react";
import { getActiveVenue } from "@/lib/tenant";
import { listCampaignsWithResults, type CampaignWithResults } from "@/server/campaigns";
import { statoConsumo } from "@/server/dem/consumo";
import { IndicatoreQuota } from "@/components/dem/indicatore-quota";
import { AnteprimaEmail } from "@/components/campaigns/wizard/anteprima-email";
import { FasciaTessere, TesseraKpi } from "@/components/ui/tessera-kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statoCampagna } from "@/lib/campaign-status";
import { compileEmailDocument, resolveTestVariables } from "@/lib/campaign-blocks-compiler";
import { hasSubstantiveContent, parseEmailDocument } from "@/lib/campaign-blocks";
import { sanitizeRichText } from "@/lib/campaign-rich-text";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CANALE: Record<CampaignWithResults["channel"], string> = {
  EMAIL: "Email",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
};

const NUM = new Intl.NumberFormat("it-IT");

export default async function CampaignsPage() {
  const ctx = await getActiveVenue();
  const [items, quota] = await Promise.all([listCampaignsWithResults(ctx.venueId), statoConsumo(ctx.venueId)]);

  const dataBreve = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    timeZone: ctx.venue.timezone,
  });

  /* Il riepilogo pesa ogni campagna per quante email ha mandato: la media
     delle percentuali darebbe a un invio da 12 lo stesso peso di uno da 400. */
  const partite = items.filter((c) => c.sentCount > 0);
  const totInviate = partite.reduce((s, c) => s + c.sentCount, 0);
  const totAperte = partite.reduce((s, c) => s + c.openedCount, 0);
  const totPrenotazioni = partite.reduce((s, c) => s + c.attribuite, 0);
  const aperturaMedia = totInviate > 0 ? Math.round((totAperte / totInviate) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        {/* Il titolo sta nella testata: qui resta la briciola che dice da
            quale sezione si arriva. */}
        <p className="t-etichetta">Marketing</p>
        {/*
          Gli invii che restano, in una riga.

          Sta qui e non in una scheda perché chi apre le Campagne vuole
          scrivere una newsletter: il dato serve per decidere se si può
          inviare, non per essere studiato. Al clic porta al piano, dove c'è
          tutto il resto.
        */}
        <div className="ml-auto flex items-center gap-3">
          <IndicatoreQuota disponibili={quota.disponibili} limite={quota.limite} sospeso={quota.sospeso} />
          <Button asChild variant="accent">
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" /> Nuova campagna
            </Link>
          </Button>
        </div>
      </header>

      {/* Quattro numeri, come in Panoramica: quanto si è mandato e cosa ha
          reso, prima di entrare nelle singole campagne. Solo se qualcosa è
          partito — quattro zeri non dicono niente a chi comincia. */}
      {partite.length > 0 && (
        <FasciaTessere colonne={4}>
          <TesseraKpi
            icona={Send}
            etichetta={["Campagna inviata", "Campagne inviate"]}
            corta={["Inviata", "Inviate"]}
            valore={partite.length}
            nota={items.length > partite.length ? `${items.length - partite.length} in preparazione` : undefined}
          />
          <TesseraKpi
            icona={Mail}
            etichetta={["Email partita", "Email partite"]}
            corta="Email"
            valore={NUM.format(totInviate)}
            nota="in tutte le campagne"
          />
          <TesseraKpi
            icona={MailOpen}
            etichetta="Apertura media"
            corta="Apertura"
            valore={`${aperturaMedia}%`}
            barra={aperturaMedia}
            nota={`${NUM.format(totAperte)} aperte`}
          />
          <TesseraKpi
            icona={CalendarCheck}
            etichetta={["Prenotazione portata", "Prenotazioni portate"]}
            corta={["Prenotazione", "Prenotazioni"]}
            valore={totPrenotazioni}
            nota="arrivate dalle email"
          />
        </FasciaTessere>
      )}

      {items.length === 0 ? (
        <div className="riquadro tratteggiato flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Megaphone className="h-6 w-6 text-tertiary-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Nessuna campagna ancora. La prima si prepara in pochi passi, partendo da un modello.
          </p>
          <Button asChild variant="accent" size="sm">
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" /> Crea la prima campagna
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <CardCampagna
              key={c.id}
              c={c}
              html={anteprima(c, ctx.venue.name)}
              quando={dataDellaCampagna(c, dataBreve)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * L'email della campagna, da guardare in miniatura.
 *
 * Una campagna si riconosce dalla sua email prima che dal nome: la foto in
 * testa, il titolo grande. I segnaposto si risolvono con un nome di esempio
 * e il nome vero del locale, come nelle anteprime del wizard.
 */
function anteprima(c: CampaignWithResults, nomeLocale: string): string | null {
  if (c.channel !== "EMAIL") return null;
  const conDocumento = c.contentBlocks && hasSubstantiveContent(parseEmailDocument(c.contentBlocks).blocks);
  /* Le campagne di prima dell'editor hanno solo `body`, l'HTML già pronto:
     meglio quello di un riquadro vuoto su una campagna che è partita. Passa
     dal sanificatore dell'editor: finisce nella pagina, non in un iframe. */
  const html = conDocumento
    ? compileEmailDocument(parseEmailDocument(c.contentBlocks))
    : c.body?.includes("<")
      ? `<div style="padding:32px 28px;font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#2a2a2a;background:#fff">${sanitizeRichText(c.body)}</div>`
      : null;
  if (!html) return null;
  return resolveTestVariables(html, {
    firstName: "Mario",
    lastName: "Rossi",
    restaurantName: nomeLocale,
    bookingLink: "#",
    unsubscribeLink: "#",
    lastVisitDate: "12 giugno",
    loyaltyLevel: "VIP",
  });
}

/** Una riga sola su quando: inviata, programmata o creata. */
function dataDellaCampagna(c: CampaignWithResults, fmt: Intl.DateTimeFormat): string {
  if (c.sentAt) return `Inviata il ${fmt.format(c.sentAt)}`;
  if (c.scheduledAt) return `Programmata per il ${fmt.format(c.scheduledAt)}`;
  return `Creata il ${fmt.format(c.createdAt)}`;
}

function CardCampagna({ c, html, quando }: { c: CampaignWithResults; html: string | null; quando: string }) {
  /* «APERTE 0%» su una bozza è una misura di qualcosa che non è accaduto:
     zero per cento di nessun invio. Su una campagna non ancora partita i
     risultati non si mostrano — si dice che non è partita, che è l'unica
     cosa vera. */
  const partita = c.sentCount > 0;
  const apertura = partita ? Math.round((c.openedCount / c.sentCount) * 100) : 0;
  const bozza = c.status === "DRAFT";
  const href = bozza ? `/campaigns/${c.id}/edit` : `/campaigns/${c.id}`;
  const stato = statoCampagna(c.status, c.scheduledAt ?? null);

  return (
    /* Le schede stanno in griglia: altezza piena per tutte e i numeri spinti
       in fondo da `mt-auto`, così le basi si allineano anche quando un
       oggetto va su due righe. */
    <Link
      href={href}
      className="group relative block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {/* La bozza è l'unica scheda su cui c'è ancora da fare: un alone d'oro
          dietro e un rilievo più alto la staccano dalle inviate, che sono
          archivio. Eccezione voluta alla lastra di DESIGN.md §4. */}
      {bozza && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-3 rounded-[1.75rem] bg-[radial-gradient(ellipse_at_center,#e2bf6d80_0%,#c9a25a40_45%,transparent_75%)] opacity-80 blur-xl transition-opacity duration-300 group-hover:opacity-100"
        />
      )}
      <article
        className={cn(
          "surface relative flex h-full flex-col overflow-hidden rounded-2xl p-0 transition-[transform,box-shadow] duration-200",
          bozza
            ? "-translate-y-1 border-[#d9b874] shadow-[inset_0_1px_0_#ffffff,inset_0_-1px_0_#efe2c2,0_2px_3px_#b08c4a4d,0_24px_44px_-16px_#9a7a3080] motion-safe:group-hover:-translate-y-1.5"
            : "motion-safe:group-hover:-translate-y-0.5 group-hover:shadow-lg",
        )}
      >
        {/* L'email in miniatura, con canale e stato sopra: si legge prima
            di tutto il resto. Senza contenuto, un riquadro che lo dice. */}
        <div className="relative">
          {html ? (
            <AnteprimaEmail html={html} className="h-44" />
          ) : (
            <div className="flex h-44 flex-col items-center justify-center gap-2 bg-secondary/60 text-muted-foreground">
              <PencilLine className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs">Email ancora da preparare</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <span className="chip-ios bg-white/90 shadow-sm backdrop-blur-sm">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {CANALE[c.channel]}
            </span>
            <Badge tone={stato.tone} className="shadow-sm">
              {stato.label}
            </Badge>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="space-y-1">
            <h3 className="text-display text-lg leading-snug">{c.name}</h3>
            {c.subject && <p className="text-sm text-muted-foreground">{c.subject}</p>}
            <p className="t-nota">{quando}</p>
          </div>

          {partita ? (
            /* «Prenotazioni» è l'attribuzione vera (vedi
               `listCampaignsWithResults`), non il vecchio `bookedCount`. */
            <dl className="mt-auto grid grid-cols-3 gap-2">
              <Numero tono="inviate" etichetta="Inviate" valore={NUM.format(c.sentCount)} />
              <Numero tono="aperte" etichetta="Aperte" valore={`${apertura}%`} barra={apertura} />
              <Numero
                tono="prenotazioni"
                etichetta="Prenotazioni"
                valore={NUM.format(c.attribuite)}
                spenta={c.attribuite === 0}
              />
            </dl>
          ) : (
            /* Due assenze diverse, e non vanno dette allo stesso modo: una
               bozza non è partita, una programmata o consegnata è partita ma
               il fornitore non ci ha ancora detto quante. Vedi la nota in
               `lib/campaign-status.ts`. */
            <div className="mt-auto flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2.5">
              <p className="t-nota">
                {bozza ? "Non ancora inviata: i risultati arriveranno qui." : "In attesa dei primi numeri dal fornitore."}
              </p>
              {bozza && (
                <span className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors group-hover:bg-primary/90">
                  Continua
                </span>
              )}
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

/**
 * I tre numeri della card, ognuno nella sua tinta: sono tre momenti diversi
 * dello stesso percorso — partita, letta, diventata un tavolo — e con lo
 * stesso fondo si leggevano come tre caselle uguali. Petrolio per l'invio,
 * ambra per l'apertura (l'oro del marchio), verde per la prenotazione, che
 * è il verde della casa e il numero che conta.
 */
const TONI = {
  inviate: {
    icona: Send,
    fondo: "bg-[#e4eef0]",
    testo: "text-[#2f5f6e]",
    barra: "bg-[#2f5f6e]",
  },
  aperte: {
    icona: MailOpen,
    fondo: "bg-[#f6ecd6]",
    testo: "text-[#8a6416]",
    barra: "bg-[#c9a25a]",
  },
  prenotazioni: {
    icona: CalendarCheck,
    fondo: "bg-[#e2eee6]",
    testo: "text-[#2c5545]",
    barra: "bg-[#2c5545]",
  },
} as const;

function Numero({
  tono,
  etichetta,
  valore,
  barra,
  spenta = false,
}: {
  tono: keyof typeof TONI;
  etichetta: string;
  valore: string;
  barra?: number;
  /** Zero prenotazioni: la tinta resta, ma più tenue — non è un risultato da esibire. */
  spenta?: boolean;
}) {
  const t = TONI[tono];
  const Icona = t.icona;
  return (
    <div className={cn("rounded-xl px-3 py-2.5", t.fondo, spenta && "opacity-70")}>
      <dt className={cn("flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider", t.testo)}>
        <Icona className="h-3 w-3 shrink-0" aria-hidden="true" />
        {etichetta}
      </dt>
      <dd className={cn("text-display mt-0.5 text-xl tabular-nums", t.testo)}>{valore}</dd>
      {barra !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/10" aria-hidden="true">
          <div className={cn("h-full rounded-full", t.barra)} style={{ width: `${Math.min(100, barra)}%` }} />
        </div>
      )}
    </div>
  );
}
