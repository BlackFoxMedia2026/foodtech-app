import { CalendarCheck2, Hourglass, MailWarning, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { can, getActiveVenue } from "@/lib/tenant";
import { listAutomations } from "@/server/automations/engine";
import { channelAvailable } from "@/server/messaging/send";
import { SILENZIO_GIORNI, TETTO_PER_ESECUZIONE } from "@/server/automations/catalogue";
import { AutomationCard } from "@/components/automations/automation-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const dynamic = "force-dynamic";

/**
 * Le automazioni, per chi entra qui la prima volta.
 *
 * La pagina risponde a una domanda sola: **quali messaggi vuoi accendere?**
 * Quattro righe, ognuna con una frase che dice cosa fa e un solo comando in
 * evidenza. Tutto il resto — testo, giorni, omaggio, prova — sta dietro
 * «Modifica»; le regole anti-spam dietro «Come funziona».
 *
 * Il numero di persone che toccherebbe oggi non è sparito: compare quando
 * si accende, nella conferma, che è il momento in cui serve leggerlo.
 */
export default async function AutomationsPage() {
  const ctx = await getActiveVenue();
  const automazioni = await listAutomations(ctx.venueId);
  const canEdit = can(ctx.role, "edit_marketing");
  const emailPronta = channelAvailable("EMAIL");

  const regole = [
    { icona: Sparkles, titolo: "Niente invii a pioggia", testo: "Scrive solo a chi ha appena superato la soglia, non a tutto l'archivio." },
    { icona: UserCheck, titolo: "Una volta sola", testo: "La stessa persona non riceve due volte lo stesso messaggio." },
    {
      icona: Hourglass,
      titolo: `${SILENZIO_GIORNI} giorni di pausa`,
      testo: `Chi ha ricevuto un vostro messaggio negli ultimi ${SILENZIO_GIORNI} giorni aspetta.`,
    },
    {
      icona: CalendarCheck2,
      titolo: `Al massimo ${TETTO_PER_ESECUZIONE} al giorno`,
      testo: "Per ogni messaggio: gli altri partono il giorno dopo.",
    },
    { icona: ShieldCheck, titolo: "Solo con il consenso", testo: "Chi non ha dato il consenso marketing non riceve niente." },
  ];

  return (
    <div className="schermo animate-fade-in">
      <div className="fill-scroll -mx-4 px-4 pb-6">
        <div>
          {/* ── Cosa sono, in una frase ─────────────────────────────────── */}
          <header className="pt-1">
            <h1 className="text-display text-2xl leading-tight text-foreground md:text-3xl">
              Messaggi che partono da soli
            </h1>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
              Accendi quelli che ti servono: ognuno scrive ai tuoi ospiti al momento giusto, senza che tu debba
              pensarci.{" "}
              <Popover>
                <PopoverTrigger className="font-medium text-accent-strong underline decoration-accent-strong/40 underline-offset-4 hover:decoration-accent-strong">
                  Come funziona
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[22rem] p-0">
                  <p className="border-b border-border px-4 py-3 text-sm font-semibold text-card-foreground">
                    Le regole, uguali per tutti i messaggi
                  </p>
                  <ul className="space-y-3 px-4 py-3.5">
                    {regole.map((r) => (
                      <li key={r.titolo} className="flex gap-3">
                        <span
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#c9a96a]/20 text-accent-strong"
                          aria-hidden="true"
                        >
                          <r.icona className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-snug text-card-foreground">{r.titolo}</p>
                          <p className="text-xs leading-snug text-muted-foreground">{r.testo}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            </p>
          </header>

          {!emailPronta && (
            <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#c9a96a]/12 px-4 py-3 text-sm leading-snug text-card-foreground ring-1 ring-inset ring-[#c9a96a]/30">
              <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
              <span>
                <strong className="font-semibold">L&apos;invio delle email non è ancora attivo.</strong> Puoi
                preparare e accendere i messaggi: partiranno quando l&apos;email sarà configurata.
              </span>
            </p>
          )}

          {/* ── I quattro messaggi ─────────────────────────────────────── */}
          <ul className="mt-6 grid gap-3 lg:grid-cols-2 lg:gap-4">
            {automazioni.map((a) => (
              <li key={a.key} className="flex">
                <AutomationCard
                  automation={a}
                  canEdit={canEdit}
                  venueName={ctx.venue.name}
                  emailAttiva={emailPronta}
                />
              </li>
            ))}
          </ul>

          {!canEdit && (
            <p className="mt-4 t-nota">Il tuo ruolo può vedere questi messaggi, non accenderli o modificarli.</p>
          )}
        </div>
      </div>
    </div>
  );
}
