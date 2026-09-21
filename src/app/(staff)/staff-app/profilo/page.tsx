import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getContestoStaff } from "@/lib/staff-auth";
import { schedaPersonale } from "@/server/staff-app/profilo";
import { inizialiDi, TestataSezione } from "@/components/staff-app/testata-staff";
import { vociDentroProfilo } from "@/components/staff-app/voci-nav";
import { CartaAccesso } from "@/components/staff-app/carta-accesso";

export const dynamic = "force-dynamic";

/**
 * **Il profilo** — §31.
 *
 * Si legge, non si modifica. Niente retribuzione, niente note del
 * responsabile, niente storico: sono dati che esistono nella scheda HR del
 * back office e che dalla parte del dipendente cambierebbero natura.
 *
 * In fondo c'è la sola cosa che questa pagina *fa*: uscire. Sta qui e non in
 * barra perché è l'azione che si fa una volta ogni sette giorni (tanto dura
 * la sessione) e perché su un dispositivo condiviso in sala deve essere
 * trovabile senza essere a portata di gomito.
 */
export default async function ProfiloPage() {
  const ctx = await getContestoStaff();
  const scheda = await schedaPersonale(ctx.venueId, ctx.persona.waiterId);
  /* Turni e Documenti: quelle che per questo mestiere non stanno in barra.
     L'elenco si calcola per differenza da `vociPer`, così una voce non può
     sparire da tutte e due. */
  const altre = vociDentroProfilo(ctx.profilo, ctx.permessi);

  return (
    <div className="schermo">
      <TestataSezione titolo="Profilo" />

      <div className="fill-scroll space-y-3 px-4 pb-4">
        <section className="riquadro comodo flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-base font-medium">
            {ctx.persona.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.persona.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              inizialiDi(ctx.persona.nome, ctx.persona.cognome)
            )}
          </span>
          <div className="min-w-0">
            <p className="t-titolo-sezione truncate">{ctx.persona.nomeCompleto}</p>
            <p className="t-nota truncate">
              {scheda?.ruolo ?? "Ruolo non impostato"} · {ctx.venueName}
            </p>
          </div>
        </section>

        {scheda && (
          <>
            <section className="riquadro comodo">
              <h2 className="t-etichetta">Dati personali</h2>
              <dl className="mt-2 space-y-1.5">
                <Voce etichetta="Telefono" valore={scheda.telefono} />
                <Voce etichetta="Email" valore={scheda.email ?? "—"} />
                <Voce etichetta="Reparto" valore={reparto(scheda.reparto)} />
                {scheda.responsabile && (
                  <Voce etichetta="Responsabile" valore={scheda.responsabile} />
                )}
                {scheda.dal && <Voce etichetta="In organico dal" valore={data(scheda.dal)} />}
              </dl>
            </section>

            <section className="riquadro comodo">
              <h2 className="t-etichetta">Contratto</h2>
              {scheda.contratto ? (
                <dl className="mt-2 space-y-1.5">
                  <Voce etichetta="Tipo" valore={scheda.contratto.tipo} />
                  <Voce etichetta="Dal" valore={data(scheda.contratto.dal)} />
                  <Voce
                    etichetta="Scadenza"
                    valore={scheda.contratto.al ? data(scheda.contratto.al) : "Senza scadenza"}
                  />
                  <Voce etichetta="Stato" valore={scheda.contratto.statoLabel} />
                </dl>
              ) : (
                <p className="t-nota mt-1.5">
                  Nessun contratto registrato. Se pensi che ci sia un errore, parlane con un
                  responsabile: da qui non si può correggere.
                </p>
              )}
            </section>
          </>
        )}

        {altre.length > 0 && (
          /*
            Quello che riguarda il rapporto di lavoro e non il servizio.
            
            Sono righe alte 60 px con l'icona della voce: le stesse icone
            della barra, perché chi ha imparato il prodotto su un profilo
            diverso — o chi cambia mestiere — ritrovi la stessa forma nello
            stesso significato.
          */
          <nav aria-label="Altre sezioni" className="overflow-hidden rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {altre.map((voce) => {
                const Icona = voce.icon;
                return (
                  <li key={voce.href}>
                    <Link href={voce.href} className="flex min-h-[60px] items-center gap-3 px-3">
                      <Icona className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-sm font-medium">{voce.label}</span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <CartaAccesso />

        <p className="t-nota pt-2 text-center">
          I dati amministrativi li gestisce chi ti ha assunto. Da qui si leggono soltanto.
        </p>
      </div>
    </div>
  );
}

function Voce({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="t-corpo text-muted-foreground">{etichetta}</dt>
      <dd className="t-corpo min-w-0 truncate text-right">{valore}</dd>
    </div>
  );
}

const REPARTI: Record<string, string> = {
  SALA: "Sala",
  CUCINA: "Cucina",
  BAR: "Bar",
  DIREZIONE: "Direzione",
  ALTRO: "Altro",
};

function reparto(k: string) {
  return REPARTI[k] ?? k;
}

function data(iso: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}
