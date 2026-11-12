import type { BookingStatus } from "@prisma/client";
import { Check, CircleAlert, MousePointerClick, Eye, CalendarCheck } from "lucide-react";
import type { Attivo, RisultatiCampagna } from "@/server/dem/statistiche";
import { StatusBadge } from "@/components/bookings/status-badge";
import { cn } from "@/lib/utils";

/**
 * I pezzi del report di una campagna (11 novembre 2026, terza passata).
 *
 * Il disegno viene dai report dei servizi di email marketing (Mailchimp,
 * Klaviyo), che si somigliano tutti per una ragione: rispondono nello stesso
 * ordine alle stesse domande. **È andata bene?** — i tassi, confrontati con
 * una media, perché «41%» da solo non dice se è tanto. **Quando?** — le
 * prime ore. **Su cosa e chi?** — i link e le persone. **Cosa ha reso?** —
 * gli ordini, che qui sono prenotazioni. **È arrivata?** — la consegna.
 *
 * I colori vengono dal validatore della skill dataviz sul fondo Carta
 * (`#f6efe1`): verde `#1f8058` e oro `#b07d2a` passano tutti i controlli; la
 * separazione per protanopia è a 7,2, nella fascia che chiede una seconda
 * codifica, e ce l'hanno sempre: etichette scritte, legenda, tratteggio.
 */

export const VERDE = "#1f8058";
export const ORO = "#b07d2a";
const ROSSO = "#9c3b22";

const NUM = new Intl.NumberFormat("it-IT");
const pctTesto = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

/* -------------------------------------------------------------------------- */
/*  I tassi, contro la media del locale                                       */
/* -------------------------------------------------------------------------- */

export type Tasso = {
  nome: string;
  valore: number | null;
  /** La media delle altre campagne del locale, se ce ne sono. */
  media: number | null;
  /** «22 su 40 consegnate» — la base del numero, che non si taglia. */
  dettaglio: string;
  icona: "apertura" | "click" | "prenotazione";
};

const ICONE = { apertura: Eye, click: MousePointerClick, prenotazione: CalendarCheck };

/**
 * Tre tassi in colonna, ciascuno con la sua barra e una tacca per la media
 * del locale, come le barre «list average» di Mailchimp.
 *
 * Ogni barra ha la **sua** scala (1,4 volte il più grande fra valore e
 * media): un click al 6% su una scala da 0 a 100 è un filo invisibile, e il
 * confronto che conta — sopra o sotto la media — sparisce. Il numero scritto
 * resta quello vero.
 */
export function Tassi({ tassi }: { tassi: Tasso[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border/60">
      {tassi.map((t) => {
        const Icona = ICONE[t.icona];
        const scala = Math.max(t.valore ?? 0, t.media ?? 0, 1) * 1.4;
        const delta = t.valore !== null && t.media !== null ? Math.round((t.valore - t.media) * 10) / 10 : null;
        return (
          <div key={t.nome} className="md:px-6 md:first:pl-0 md:last:pr-0">
            <p className="flex items-center gap-2 text-base font-medium text-foreground">
              <Icona className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t.nome}
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-4xl tabular-nums text-foreground">{pctTesto(t.valore)}</span>
              {delta !== null && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-sm font-medium tabular-nums",
                    delta >= 0 ? "bg-[#1f8058]/10 text-[#17603f]" : "bg-[#b07d2a]/12 text-[#7a5418]",
                  )}
                >
                  {delta >= 0 ? "+" : "−"}
                  {Math.abs(delta).toLocaleString("it-IT")} punti
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">{t.dettaglio}</p>

            <div
              className="relative mt-4 h-3 rounded-full bg-secondary/70"
              role="img"
              aria-label={`${t.nome}: ${pctTesto(t.valore)}${t.media !== null ? `, media del locale ${pctTesto(t.media)}` : ""}`}
            >
              {t.valore !== null && t.valore > 0 && (
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(t.valore / scala) * 100}%`, background: t.icona === "prenotazione" ? ORO : VERDE }}
                />
              )}
              {t.media !== null && (
                <div className="absolute -top-1.5 h-6 w-[3px] rounded-full bg-foreground/70" style={{ left: `calc(${(t.media / scala) * 100}% - 1.5px)` }} />
              )}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              {t.media !== null ? (
                <>
                  <span className="inline-block h-3 w-[3px] rounded-full bg-foreground/70" aria-hidden="true" />
                  media del locale {pctTesto(t.media)}
                </>
              ) : (
                "nessuna altra campagna da confrontare"
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  I link più cliccati                                                       */
/* -------------------------------------------------------------------------- */

function nomeLink(url: string) {
  try {
    const u = new URL(url);
    if (u.pathname.endsWith("/prenota")) return "Prenota il tuo tavolo";
    if (u.pathname.endsWith("/menu")) return "Sfoglia il menu";
    if (u.hostname.includes("instagram")) return "Instagram";
    return u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}

export function LinkCliccati({ link }: { link: RisultatiCampagna["linkPiuCliccati"] }) {
  if (link.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-base text-muted-foreground">Nessun click ancora.</p>;
  }
  const totale = link.reduce((n, l) => n + l.click, 0);
  const max = Math.max(1, ...link.map((l) => l.click));
  return (
    <ol className="space-y-4">
      {link.map((l, i) => (
        <li key={l.url}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-base font-medium text-foreground">
                <span className="mr-2 font-mono text-sm text-muted-foreground">{i + 1}</span>
                {nomeLink(l.url)}
              </span>
              <span className="block truncate text-xs text-muted-foreground" title={l.url}>
                {l.url.replace(/^https?:\/\//, "").split("?")[0]}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-mono text-lg tabular-nums text-foreground">{NUM.format(l.click)}</span>
              <span className="ml-1.5 text-sm text-muted-foreground">{Math.round((l.click / Math.max(1, totale)) * 100)}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary/60">
            <div className="h-full rounded-full" style={{ width: `${(l.click / max) * 100}%`, background: VERDE, opacity: i === 0 ? 1 : 0.6 }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chi ha interagito di più                                                  */
/* -------------------------------------------------------------------------- */

function iniziali(nome: string) {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function PiuAttivi({ persone }: { persone: Attivo[] }) {
  if (persone.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-6 text-center text-base text-muted-foreground">Nessuna apertura ancora.</p>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {persone.map((p, i) => {
        const riga = (
          <>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(160deg,#1C4A3A_0%,#102B22_100%)] text-sm font-semibold text-cream">
              {iniziali(p.nome)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium text-foreground">{p.nome}</span>
              <span className="block text-sm text-muted-foreground">
                {p.aperture} {p.aperture === 1 ? "apertura" : "aperture"} · {p.click} click
              </span>
            </span>
            {p.prenotato && (
              <span className="shrink-0 rounded-full bg-[#b07d2a]/15 px-2.5 py-1 text-xs font-semibold text-[#7a5418]">Ha prenotato</span>
            )}
          </>
        );
        return (
          <li key={`${p.guestId ?? p.nome}-${i}`}>
            {p.guestId ? (
              <a href={`/guests/${p.guestId}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-card-sunken/60">
                {riga}
              </a>
            ) : (
              <div className="flex items-center gap-3 py-2.5">{riga}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*  Le prenotazioni arrivate                                                  */
/* -------------------------------------------------------------------------- */

const QUANDO = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const GIORNO_BREVE = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

export type PrenotazioneArrivata = {
  id: string;
  startsAt: Date;
  createdAt: Date;
  partySize: number;
  status: BookingStatus;
  guest: { firstName: string; lastName: string | null } | null;
};

export function PrenotazioniArrivate({ prenotazioni }: { prenotazioni: PrenotazioneArrivata[] }) {
  if (prenotazioni.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-base text-muted-foreground">
        Nessuna prenotazione dal link di questa campagna, per ora.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left">
        <thead>
          <tr className="border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
            <th className="pb-2 font-medium">Cliente</th>
            <th className="pb-2 font-medium">A cena</th>
            <th className="pb-2 text-right font-medium">Coperti</th>
            <th className="pb-2 pl-4 font-medium">Prenotata il</th>
            <th className="pb-2 font-medium">Stato</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {prenotazioni.map((b) => (
            <tr key={b.id} className="text-base">
              <td className="py-3 pr-3 font-medium text-foreground">
                {b.guest ? [b.guest.firstName, b.guest.lastName].filter(Boolean).join(" ") : "Ospite"}
              </td>
              <td className="py-3 pr-3 tabular-nums text-foreground first-letter:uppercase">{QUANDO.format(b.startsAt)}</td>
              <td className="py-3 text-right font-mono tabular-nums text-foreground">{b.partySize}</td>
              <td className="py-3 pl-4 pr-3 text-sm tabular-nums text-muted-foreground">{GIORNO_BREVE.format(b.createdAt)}</td>
              <td className="py-3">
                <StatusBadge status={b.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  La consegna                                                               */
/* -------------------------------------------------------------------------- */

/**
 * È arrivata? Una barra divisa per esito (solo se il fornitore manda le
 * consegne: senza, era una barra grigia piena, un grafico di niente) e
 * cinque tessere con un segno: spunta verde se va bene, allarme oro se no.
 */
export function Consegna({ r }: { r: RisultatiCampagna }) {
  const tracciate = r.consegnate > 0;
  const senzaEsito = Math.max(0, r.inviate - r.consegnate - r.rimbalzi - r.nonRiuscite);
  const fette = [
    { nome: "Consegnate", valore: r.consegnate, colore: VERDE },
    { nome: "In attesa di esito", valore: senzaEsito, colore: "hsl(var(--border-strong))" },
    { nome: "Non recapitate", valore: r.rimbalzi, colore: ORO },
    { nome: "Non riuscite", valore: r.nonRiuscite, colore: ROSSO },
  ].filter((f) => f.valore > 0);
  const totale = Math.max(1, fette.reduce((n, f) => n + f.valore, 0));
  const guai = r.rimbalzi + r.nonRiuscite + r.segnalazioni;

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-base font-medium",
          guai === 0 ? "bg-[#1f8058]/10 text-[#17603f]" : "bg-[#b07d2a]/12 text-[#7a5418]",
        )}
      >
        {guai === 0 ? <Check className="h-5 w-5 shrink-0" aria-hidden="true" /> : <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />}
        {guai === 0
          ? "Invio pulito: nessun rimbalzo, errore o segnalazione."
          : `${NUM.format(r.rimbalzi + r.nonRiuscite)} ${r.rimbalzi + r.nonRiuscite === 1 ? "email non è arrivata" : "email non sono arrivate"}: controlla gli indirizzi nelle schede dei clienti.`}
      </div>

      {tracciate && (
        <div>
          <div className="flex h-4 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Esito delle email inviate">
            {fette.map((f) => (
              <div key={f.nome} title={`${f.nome}: ${NUM.format(f.valore)}`} style={{ width: `${(f.valore / totale) * 100}%`, background: f.colore }} />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
            {fette.map((f) => (
              <li key={f.nome} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.colore }} aria-hidden="true" />
                <span className="text-muted-foreground">{f.nome}</span>
                <span className="font-mono tabular-nums text-foreground">{NUM.format(f.valore)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <Segnale nome="Consegnate" valore={r.consegnate} buono nota={tracciate ? `${pctTesto(r.tassoConsegna)} delle inviate` : "esito non arrivato"} />
        <Segnale nome="Non recapitate" valore={r.rimbalzi} nota="indirizzo sbagliato o pieno" />
        <Segnale nome="Non riuscite" valore={r.nonRiuscite} nota="errore nell'invio" />
        <Segnale nome="Segnalate come spam" valore={r.segnalazioni} nota="dal destinatario" />
        <Segnale nome="Disiscrizioni" valore={r.disiscrizioni} nota="non riceveranno più email" />
      </dl>
    </div>
  );
}

function Segnale({ nome, valore, nota, buono = false }: { nome: string; valore: number; nota: string; buono?: boolean }) {
  /* Per «consegnate» il numero alto è il bene; per le altre, lo zero. */
  const male = !buono && valore > 0;
  const Icona = male ? CircleAlert : Check;
  return (
    <div className={cn("rounded-xl border px-3.5 py-3", male ? "border-[#b07d2a]/40 bg-[#b07d2a]/8" : "border-border/60 bg-card-sunken/50")}>
      <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {(!buono || valore > 0) && <Icona className={cn("h-3.5 w-3.5", male ? "text-[#b07d2a]" : "text-[#1f8058]")} aria-hidden="true" />}
        {nome}
      </dt>
      <dd className="mt-1 font-mono text-2xl tabular-nums text-foreground">{NUM.format(valore)}</dd>
      <dd className="text-xs leading-snug text-muted-foreground">{nota}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  L'email com'è arrivata                                                    */
/* -------------------------------------------------------------------------- */

/** `{{nome}}` diventa una pastiglia «Nome»: ognuno riceve il suo, qui si mostra dove va. */
function conSegnaposti(html: string) {
  return html.replace(
    /\{\{\s*([a-zà-ù_]+)\s*\}\}/gi,
    (_, nome: string) =>
      `<span style="display:inline-block;padding:0 .45em;border-radius:999px;background:#1f80581a;color:#17603f;font-size:.85em;font-weight:600">${nome.charAt(0).toUpperCase()}${nome.slice(1)}</span>`,
  );
}

/**
 * L'email in una cornice da casella di posta: mittente, oggetto e anteprima
 * come in una lista di messaggi, il corpo su carta bianca.
 */
export function AnteprimaEmail({
  oggetto,
  anteprima,
  corpo,
  mittente,
}: {
  oggetto: string;
  anteprima?: string | null;
  corpo: string;
  mittente: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card-sunken/40 shadow-[0_6px_16px_rgba(47,31,17,0.06)]">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(160deg,#1C4A3A_0%,#102B22_100%)] text-sm font-semibold text-cream">
          {iniziali(mittente)}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{mittente}</span>
          <span className="block truncate text-base text-foreground">
            {oggetto || "Senza oggetto"}
            {anteprima && <span className="text-muted-foreground"> — {anteprima}</span>}
          </span>
        </span>
      </div>
      <div className="relative m-3 max-h-[26rem] overflow-hidden rounded-lg bg-white px-6 py-5 text-[15px] leading-relaxed text-[#2f1f11]">
        {corpo ? (
          <div
            className="[&_a]:font-medium [&_a]:text-[#1f8058] [&_a]:underline [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_img]:max-w-full [&_p+p]:mt-3"
            dangerouslySetInnerHTML={{ __html: conSegnaposti(corpo) }}
          />
        ) : (
          <p className="text-[#2f1f11]/50">Nessun testo.</p>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
      </div>
    </div>
  );
}
