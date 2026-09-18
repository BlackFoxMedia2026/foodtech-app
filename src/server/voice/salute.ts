import { db } from "@/lib/db";
import {
  ORDINE_CAPACITA,
  NOME_CAPACITA,
  type CapacitaVoice,
} from "@/lib/voice-capacita";
import { capacitaDi, fornitoreDi } from "@/server/voice/provider";

/**
 * Il telefono sta funzionando?
 *
 * ## La domanda vera del supporto
 *
 * «Non mi arrivano le chiamate.» È la telefonata che arriva, ed è sempre una
 * di queste tre cose:
 *
 * 1. la licenza non è più valida — e questo lo diceva già;
 * 2. **non c'è nessuna chiave di collegamento**, quindi il centralino non ha
 *    modo di parlare con Tavolo: si emette da Impostazioni → Telefono, e se
 *    nessuno l'ha mai fatto non arriverà niente per sempre;
 * 3. c'è tutto e semplicemente non ha chiamato nessuno.
 *
 * La differenza fra la seconda e la terza è invisibile: entrambe si presentano
 * come una pagina del telefono vuota. Fin qui l'unico modo di distinguerle era
 * leggere i registri del server, cioè una cosa che il ristoratore non può fare
 * e che a noi costa mezz'ora.
 *
 * ## Non inventa niente
 *
 * Tre letture su dati che ci sono: quando è arrivata l'ultima chiamata, quante
 * ne sono arrivate in ventiquattr'ore, e se esiste una chiave viva. Nessuna
 * sonda verso il centralino — non c'è nessun indirizzo da interrogare, e
 * fingere un «ping» verde leggendo il nostro stesso database sarebbe la
 * peggiore delle spie: quella che dice che va tutto bene perché non sa
 * guardare.
 */

export type SaluteVoice = {
  /** Quando è arrivata l'ultima chiamata, qualunque esito. */
  ultimaChiamata: Date | null;
  /** Quante nelle ultime ventiquattr'ore: dice se il telefono è vivo adesso. */
  ultime24h: number;
  /**
   * Esiste una chiave di collegamento non revocata.
   *
   * Senza, **il centralino non può mandare niente**: non è un dettaglio di
   * configurazione, è la differenza fra un telefono collegato e un telefono
   * che sembra collegato.
   */
  collegamentoAttivo: boolean;
  /** Come si chiama il fornitore, per chi legge. */
  fornitore: string;
  capacita: CapacitaVoice;
  /** Cosa sa fare, detto per una persona. */
  sannoFare: string[];
  /** Cosa non sa fare: è la risposta a «perché non posso trasferire?». */
  nonSannoFare: string[];
};

export async function saluteVoice(
  venueId: string,
  adesso: Date = new Date(),
): Promise<SaluteVoice> {
  const da = new Date(adesso.getTime() - 24 * 60 * 60 * 1000);

  const [ultima, ultime24h, chiave, fornitore, capacita] = await Promise.all([
    db.phoneCall.findFirst({
      where: { venueId },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    db.phoneCall.count({ where: { venueId, startedAt: { gte: da } } }),
    /* Una sola riga basta: la domanda è «ce n'è almeno una viva?», e contarle
       non aggiunge niente a chi legge. */
    db.apiToken.findFirst({
      where: {
        venueId,
        revokedAt: null,
        OR: [
          { scopes: { has: "telefonia:write" } },
          { scopes: { has: "telefonia:read" } },
        ],
      },
      select: { id: true },
    }),
    fornitoreDi(venueId),
    capacitaDi(venueId),
  ]);

  const sannoFare: string[] = [];
  const nonSannoFare: string[] = [];
  for (const c of ORDINE_CAPACITA) {
    (capacita[c] ? sannoFare : nonSannoFare).push(NOME_CAPACITA[c]);
  }

  return {
    ultimaChiamata: ultima?.startedAt ?? null,
    ultime24h,
    collegamentoAttivo: chiave != null,
    fornitore: fornitore.etichetta,
    capacita,
    sannoFare,
    nonSannoFare,
  };
}
