import Link from "next/link";
import { Phone, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GruppoImpostazioni,
  RigaImpostazione,
  ValoreImpostazione,
  ValoreVuoto,
} from "@/components/settings/righe-impostazioni";
import { daQuando } from "@/lib/utils";
import {
  FUNZIONI_CENTRALINO,
  type FunzioneCentralino,
} from "@/lib/licenza-centralino";

/**
 * Il telefono del locale: **com'è adesso**.
 *
 * Il centralino non è un altro gestionale: chi risponde al telefono lavora
 * nelle stesse schermate dove vede le prenotazioni. Quello che si compra è una
 * chiave.
 *
 * ## Cos'era e perché è cambiata
 *
 * Era **dodici righe con dentro tutto**: la chiave da incollare, il codice del
 * locale, il pulsante che emette la chiave di collegamento, i tre campi del
 * telefono nel browser, e in mezzo i valori da leggere. Tutto insieme, senza
 * un ordine — e collegare un locale sono sei gesti in due applicazioni, in una
 * sequenza precisa, con due chiavi che viaggiano in versi opposti. Chi
 * guardava questa scheda doveva sapere già cosa fare per capire dove mettere
 * le mani.
 *
 * Adesso la scheda **si legge** e non si compila: stato, collegamento, ultima
 * chiamata, cosa è accesa, cosa la linea non sa fare. Le cose da fare stanno
 * in `/settings/telefono/collega`, un passo per volta, e il pulsante in alto
 * ci porta.
 *
 * Per questo il componente non è più `"use client"`: non c'è più niente da
 * scrivere qui dentro.
 */

const COSA_FA: Record<FunzioneCentralino, string> = {
  riconoscimento:
    "Quando il telefono squilla, Tavolo mostra chi sta chiamando: nome, allergie, quante volte non si è presentato.",
  prenotazioni:
    "Le prenotazioni prese al telefono entrano in Tavolo senza riscriverle.",
  statistiche:
    "Quante chiamate arrivano, in quali ore, e quante diventano prenotazioni.",
};

const NOME_FUNZIONE: Record<FunzioneCentralino, string> = {
  riconoscimento: "Chi sta chiamando",
  prenotazioni: "Prenotazioni al telefono",
  statistiche: "I numeri del telefono",
};

const GIORNO = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export type StatoSipVista = {
  pronto: boolean;
  server: string | null;
  utente: string | null;
  passwordPresente: boolean;
  sottoChiave: boolean;
};

/** Come va il telefono, adesso. */
export type SaluteVista = {
  ultimaChiamata: string | null;
  ultime24h: number;
  collegamentoAttivo: boolean;
  fornitore: string;
  nonSannoFare: string[];
};

export type StatoCentralinoVista = {
  attivo: boolean;
  funzioni: string[];
  scadeIl: string | null;
  attivatoIl: string | null;
  chiaveLeggibile: string | null;
  motivoSpento: "scaduta" | "non_piu_valida" | null;
};

export function Centralino({
  stato,
  salute,
  risposte,
  ingresso,
  canManage,
}: {
  stato: StatoCentralinoVista;
  /** Come va, quando il telefono è collegato. */
  salute?: SaluteVista;
  /** Quante risposte pronte ha scritto il locale, quando il telefono c'è. */
  risposte?: { quante: number };
  /** Da dove entrano le chiamate. Nullo = non ancora scelto. */
  ingresso: "GATEWAY" | "DEVIAZIONE" | null;
  canManage: boolean;
}) {
  const scadenza = stato.scadeIl ? new Date(stato.scadeIl) : null;
  /* Il giorno *scritto* sulla licenza è l'ultimo valido, e la fine è la
     mezzanotte dopo: sottraendo un minuto si torna al giorno da mostrare,
     altrimenti a chi ha pagato fino al 17 si dice «scade il 18». */
  const ultimoGiorno = scadenza ? new Date(scadenza.getTime() - 60_000) : null;

  /* Manca ancora qualcosa? Lo dice il pulsante, non un cartello: «Collega il
     telefono» quando c'è da collegare, «Gestisci il collegamento» quando è a
     posto. */
  const daCollegare = !stato.attivo || !salute?.collegamentoAttivo;

  return (
    <>
      <GruppoImpostazioni
        titolo="Il collegamento"
        descrizione={
          stato.attivo
            ? "Il telefono del locale è collegato a Tavolo."
            : "Collegando il telefono, Tavolo riconosce chi chiama e prende le prenotazioni senza riscriverle."
        }
        azione={
          canManage ? (
            <Button
              asChild
              variant={daCollegare ? "accent" : "outline"}
              size="sm"
            >
              <Link href="/settings/telefono/collega">
                <Wrench className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {daCollegare
                  ? "Collega il telefono"
                  : "Gestisci il collegamento"}
              </Link>
            </Button>
          ) : undefined
        }
      >
        <RigaImpostazione
          nome="Stato"
          descrizione={
            stato.motivoSpento === "scaduta"
              ? "La chiave è scaduta. Le prenotazioni già prese al telefono restano: si è spento il telefono, non la storia."
              : stato.motivoSpento === "non_piu_valida"
                ? "La chiave inserita non è più valida. Scrivici: te ne mandiamo una nuova."
                : undefined
          }
        >
          {stato.attivo ? (
            <Badge tone="success">
              <Phone className="mr-1 h-3 w-3" aria-hidden="true" />
              Collegato
            </Badge>
          ) : stato.motivoSpento ? (
            <Badge tone="warning">Da riattivare</Badge>
          ) : (
            <Badge tone="neutral">Non collegato</Badge>
          )}
        </RigaImpostazione>

        {/* Da dove entrano le chiamate: sta **qui**, in cima al collegamento,
            perche e la riga che spiega tutte le altre. Chi guarda «Ultima
            chiamata: mai» e vede «cellulare con deviazione» sa dove andare a
            guardare; senza questa riga cercherebbe il guasto in Tavolo. */}
        <RigaImpostazione
          nome="Come entrano le chiamate"
          descrizione={
            ingresso === "DEVIAZIONE"
              ? "L'operatore telefonico devia a Tavolo quando non rispondi o sei occupato. Le telefonate a cui rispondi tu non passano da qui."
              : ingresso === "GATEWAY"
                ? "Dalla scatoletta attaccata alla linea del locale: Tavolo vede tutte le telefonate, anche quelle che prendi tu."
                : undefined
          }
        >
          {ingresso === "DEVIAZIONE" ? (
            <ValoreImpostazione>Cellulare, con deviazione</ValoreImpostazione>
          ) : ingresso === "GATEWAY" ? (
            <ValoreImpostazione>Fisso, con la scatoletta</ValoreImpostazione>
          ) : (
            <ValoreVuoto>da scegliere</ValoreVuoto>
          )}
        </RigaImpostazione>

        {stato.attivo && ultimoGiorno && (
          <RigaImpostazione
            nome="Chiave"
            descrizione={
              stato.attivatoIl
                ? `Inserita il ${GIORNO.format(new Date(stato.attivatoIl))}, valida fino al ${GIORNO.format(ultimoGiorno)}.`
                : `Valida fino al ${GIORNO.format(ultimoGiorno)}.`
            }
          >
            {/* Solo le ultime lettere: bastano a rispondere a «è quella che ti ho
              mandato?», e una schermata che la ripete per intero è una
              schermata da cui si copia. */}
            <ValoreImpostazione mono>
              {stato.chiaveLeggibile}
            </ValoreImpostazione>
          </RigaImpostazione>
        )}

        {/*
        Le due righe che rispondono a «non mi arrivano le chiamate»: senza una
        chiave di collegamento il centralino non può mandare niente, e un
        telefono senza chiave è identico a un telefono su cui non ha chiamato
        nessuno.
      */}
        {stato.attivo && salute && (
          <>
            <RigaImpostazione
              nome="Collegamento"
              descrizione={
                salute.collegamentoAttivo
                  ? `Il centralino (${salute.fornitore}) può mandare le chiamate a Tavolo.`
                  : "Manca la chiave con cui il centralino manda le chiamate: finché non c'è, qui non arriverà niente."
              }
            >
              {salute.collegamentoAttivo ? (
                <Badge tone="success">Pronto</Badge>
              ) : (
                <Badge tone="warning">Manca la chiave</Badge>
              )}
            </RigaImpostazione>

            <RigaImpostazione
              nome="Ultima chiamata"
              descrizione={
                salute.ultimaChiamata
                  ? `${salute.ultime24h === 0 ? "Nessuna" : salute.ultime24h === 1 ? "Una" : salute.ultime24h} nelle ultime 24 ore.`
                  : salute.collegamentoAttivo
                    ? "Non è ancora arrivata nessuna chiamata. Se il telefono del locale squilla e qui non compare niente, il centralino non sta consegnando."
                    : undefined
              }
            >
              <ValoreImpostazione>
                {salute.ultimaChiamata
                  ? daQuando(new Date(salute.ultimaChiamata))
                  : "mai"}
              </ValoreImpostazione>
            </RigaImpostazione>
          </>
        )}

        {/* Cosa **non** sa fare, e non è un elenco di scuse: è la risposta alla
          domanda «perché non posso trasferire?». I pulsanti che non
          funzionerebbero non compaiono da nessuna parte, e senza questa riga
          la loro assenza sembrerebbe un difetto del prodotto invece di un
          limite della linea. */}
        {stato.attivo && salute && salute.nonSannoFare.length > 0 && (
          <RigaImpostazione
            nome="Cosa non fa ancora"
            descrizione={`${salute.nonSannoFare.join(", ")}. I comandi che la linea non sa eseguire non compaiono: un pulsante che non trasferisce è peggio della sua assenza.`}
          />
        )}
      </GruppoImpostazioni>

      <GruppoImpostazioni
        titolo="Cosa è acceso"
        descrizione="Le funzioni che la chiave accende in questo locale. Quelle spente si possono comprare."
      >
        {FUNZIONI_CENTRALINO.map((f) => {
          const accesa = stato.funzioni.includes(f);
          return (
            <RigaImpostazione
              key={f}
              nome={NOME_FUNZIONE[f]}
              descrizione={COSA_FA[f]}
            >
              {accesa ? (
                <Badge tone="success">Attiva</Badge>
              ) : (
                /* Spenta, non assente: si vede cosa c'è da avere. Una funzione
                 che non si sa di poter comprare non si compra. */
                <Badge tone="neutral">Non attiva</Badge>
              )}
            </RigaImpostazione>
          );
        })}
      </GruppoImpostazioni>

      {risposte && (
        <GruppoImpostazioni
          titolo="Cosa rispondere"
          descrizione="Le domande che arrivano venti volte al giorno, con la risposta che decidi tu."
        >
          <RigaImpostazione
            nome="Le risposte scritte"
            descrizione={
              risposte.quante === 0
                ? "Cani, parcheggio, glutine, orari di Pasqua. Si cercano dalla pagina Telefono mentre si parla, e le legge anche l'assistente."
                : "Si cercano dalla pagina Telefono mentre si parla, e le legge anche l'assistente."
            }
          >
            <div className="flex items-center gap-2">
              {risposte.quante > 0 && (
                <span className="t-nota tabular-nums">{risposte.quante}</span>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/telefono">
                  {risposte.quante === 0 ? "Scrivile" : "Gestisci"}
                </Link>
              </Button>
            </div>
          </RigaImpostazione>
        </GruppoImpostazioni>
      )}
    </>
  );
}
