import { getContestoStaff } from "@/lib/staff-auth";
import { puo } from "@/lib/permessi-staff";
import { salaDelCameriere } from "@/server/staff-app/sala";
import { ListaTavoli } from "@/components/staff-app/lista-tavoli";
import { TestataSezione } from "@/components/staff-app/testata-staff";

export const dynamic = "force-dynamic";

/**
 * **La sala del cameriere** — §27.
 *
 * Niente editor, niente configurazione, niente piantina da modificare: tavoli,
 * stati, assegnazioni. Chi ha `view_all_tables` può passare a tutta la sala con
 * un interruttore; gli altri non ricevono nemmeno i dati degli altri tavoli.
 *
 * ## Perché una griglia di tasti e non la piantina
 *
 * La piantina di Tavolo esiste ed è buona — su un tablet al leggio. A 375 px
 * una sala da venti tavoli disegnata in scala dà riquadri da trenta pixel: non
 * si legge il numero e non si prende con un dito.
 *
 * Qui i tavoli sono **tasti in griglia**, ordinati per urgenza: due colonne,
 * otto per schermata, ognuno con il tavolo disegnato nella sua forma vera.
 * Prima era un elenco di schede larghe quanto lo schermo — quattro per
 * schermata, piene di testo che si legge stando fermi. Chi cammina con un
 * telefono in mano sceglie un tavolo, non legge una riga: il ragionamento per
 * esteso sta in `griglia-tavoli.tsx`.
 *
 * La piantina in scala resta la strada giusta su schermi larghi, ed è il
 * prossimo passo naturale: i dati che le servono (`roomId`, `sale`) arrivano
 * già da `salaDelCameriere`.
 */
export default async function SalaStaffPage() {
  const ctx = await getContestoStaff("view_tables");
  const tuttaLaSala = puo(ctx.permessi, "view_all_tables");
  const puoAccomodare = puo(ctx.permessi, "manage_tables");

  const sala = await salaDelCameriere(
    {
      venueId: ctx.venueId,
      timezone: ctx.timezone,
      waiterId: ctx.persona.waiterId,
    },
    /*
      I tavoli **liberi** anche a chi non ha `view_all_tables`.

      Non è un permesso aggirato, ed è la stessa giustificazione scritta
      accanto a `OpzioniSala.ancheLiberi`: un tavolo libero non ha sopra i
      dati di nessuno. Senza questi tavoli la Sala non potrebbe accomodare
      nessuno — si vedrebbe chi aspetta e nessun posto dove metterlo, che è
      il modo più preciso di rendere inutile la schermata.
    */
    /*
      E i tavoli **scoperti**: gente seduta e nessun cameriere assegnato. La
      Sala è la schermata in cui si va a prendere un tavolo, e un tavolo che
      non è di nessuno è precisamente quello che si va a prendere. Il perché
      per esteso sta su `OpzioniSala.ancheScoperti`.
    */
    { ancheLiberi: true, ancheScoperti: true },
  );

  return (
    <div className="schermo">
      <TestataSezione
        titolo="Sala"
        sottotitolo={`${sala.servizio} · ${sala.sale.map((s) => s.nome).join(", ") || "Sala unica"}`}
      />

      <ListaTavoli
        iniziale={sala}
        puoVedereTutti={tuttaLaSala}
        puoAccomodare={puoAccomodare}
      />
    </div>
  );
}
