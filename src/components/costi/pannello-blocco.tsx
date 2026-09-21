import { euro, euroConSegno } from "@/lib/euro";
import { invii } from "@/lib/dem-piani";
import { GestisciLimite } from "./gestisci-limite";
import { RiprovaInvio } from "./riprova-invio";

/**
 * Perché questa campagna non è partita, e cosa si può fare.
 *
 * Lo vede **solo** chi amministra la piattaforma. Al ristoratore resta il
 * messaggio neutro: il tetto di spesa che teniamo su di lui è un fatto nostro,
 * e mostrarglielo suonerebbe come «ci costi troppo» — che è vero e non è
 * qualcosa che si dice a un cliente dentro una schermata.
 *
 * I numeri sono quelli del **momento del blocco**, non di adesso: sono loro ad
 * aver prodotto il rifiuto, e rileggerli dal ledger di oggi racconterebbe
 * un'altra storia — magari tranquillizzante, mentre la campagna è ancora ferma.
 */

export type DettaglioBlocco = {
  motivo: string;
  quando: Date;
  dati: Record<string, unknown>;
};

export function PannelloBlocco({
  campaignId,
  venueId,
  blocco,
  budgetBaseCents,
  overrideBudgetCents,
  budgetCents,
  emailLimite,
}: {
  campaignId: string;
  venueId: string;
  blocco: DettaglioBlocco;
  budgetBaseCents: number | null;
  overrideBudgetCents: number;
  budgetCents: number | null;
  emailLimite: number;
}) {
  const n = (chiave: string): number => {
    const v = blocco.dati[chiave];
    return typeof v === "number" ? v : 0;
  };

  return (
    <section className="surface border-destructive/40 p-5 space-y-4">
      <div>
        <p className="t-titolo-scheda">Invio bloccato</p>
        <p className="t-nota mt-1">
          Riquadro visibile solo agli amministratori di piattaforma · bloccato il{" "}
          {new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(blocco.quando)}
        </p>
      </div>

      {blocco.motivo === "EMAIL_LIMIT_EXCEEDED" && (
        <>
          <Voce etichetta="Motivo" valore="Limite invii del piano" />
          <div className="grid gap-4 sm:grid-cols-4">
            <Voce etichetta="Destinatari della campagna" valore={invii(n("destinatari"))} />
            <Voce etichetta="Invii ancora disponibili" valore={invii(n("disponibili"))} />
            <Voce etichetta="Limite effettivo del ciclo" valore={invii(emailLimite)} />
            <Voce etichetta="Ne mancano" valore={invii(n("mancanti"))} forte />
          </div>
        </>
      )}

      {blocco.motivo === "BUDGET_LIMIT_EXCEEDED" && (
        <>
          <Voce etichetta="Motivo" valore="Budget infrastruttura" />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Voce etichetta="Costo già maturato" valore={euro(n("spesoCents"))} />
            <Voce etichetta="Costo impegnato" valore={euro(n("impegnatoCents"))} />
            <Voce etichetta="Costo stimato della campagna" valore={euro(n("stimaCents"))} />
            <Voce etichetta="Budget effettivo del ciclo" valore={euro(n("budgetCents"))} />
            <Voce etichetta="Totale previsto" valore={euro(n("totaleCents"))} />
          </div>
          <p className="text-sm">
            Superamento previsto:{" "}
            <strong className="tabular-nums">{euroConSegno(n("eccedenzaCents"))}</strong>
          </p>
        </>
      )}

      {blocco.motivo === "COST_CALCULATION_UNAVAILABLE" && (
        <>
          <Voce etichetta="Motivo" valore="Impossibile calcolare il costo infrastruttura." />
          <p className="text-sm">
            {blocco.dati.motivo === "SENZA_CAMBIO"
              ? "Manca il cambio verso la valuta di fatturazione: registrane uno dal pannello dei costi e riprova."
              : blocco.dati.motivo === "SENZA_LISTINO"
                ? "Manca il prezzo a listino per l'invio email: aggiungi una riga attiva in ProviderPrice e riprova."
                : "Configurazione incompleta."}
          </p>
          <p className="t-nota">
            Il blocco è prudenziale: senza un costo, ogni controllo successivo lo tratterebbe come zero e il
            tetto non fermerebbe più niente.
          </p>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <GestisciLimite
          venueId={venueId}
          budgetBaseCents={budgetBaseCents}
          overrideBudgetCents={overrideBudgetCents}
          budgetCents={budgetCents}
          emailLimite={emailLimite}
        />
        <RiprovaInvio campaignId={campaignId} />
      </div>
    </section>
  );
}

function Voce({ etichetta, valore, forte }: { etichetta: string; valore: string; forte?: boolean }) {
  return (
    <div>
      <p className="t-etichetta">{etichetta}</p>
      <p className={`mt-0.5 tabular-nums ${forte ? "text-lg" : ""}`}>{valore}</p>
    </div>
  );
}
