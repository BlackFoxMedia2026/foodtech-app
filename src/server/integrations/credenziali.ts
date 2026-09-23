import { db } from "@/lib/db";
import { cifraLegato, cifraturaAttiva, decifraLegato } from "@/lib/cifratura";
import { logAttenzione } from "@/lib/observability";
import { ErroreIntegrazione, normalizzaErrore } from "./errori";
import type { CredenzialiNuove, IntegrationAdapter, Segreti } from "./adapters/tipi";

/**
 * **La custodia delle credenziali.** L'unico file che le cifra e le decifra.
 *
 * Tre regole, e un test per ognuna (`integrazioni-credenziali`):
 *
 * 1. **Mai in chiaro nel database.** `cifraLegato` rifiuta di lavorare senza
 *    `CHIAVE_CIFRATURA`: un'installazione senza chiave non custodisce
 *    credenziali, e lo dice (`ENCRYPTION_UNAVAILABLE`).
 * 2. **Legate a chi le possiede.** Il contesto di cifratura è
 *    `integrazione:<locale>:<installazione>`: copiare la riga sotto
 *    un'altra installazione o un altro locale la rende indecifrabile. È
 *    l'isolamento fra ristoranti applicato ai token.
 * 3. **Mai verso il browser, mai nei log.** Nessuna funzione esportata da
 *    questo modulo restituisce i segreti a una rotta: `leggiSegreti` la usa
 *    solo il servizio per costruire il contesto di un adattatore, e la vista
 *    per l'interfaccia (`vista.ts`) non ha nemmeno il campo.
 *
 * ## Il rinnovo, e perché ha un lucchetto
 *
 * Lightspeed accetta ogni token di rinnovo **una volta sola**. Due richieste
 * che rinnovano in parallelo — la sincronizzazione programmata e un clic su
 * «Sincronizza ora» nello stesso secondo — mandano lo stesso token: la prima
 * lo consuma, la seconda riceve `invalid_grant`, e l'integrazione finirebbe
 * in «ricollega» per un difetto nostro.
 *
 * Quindi il rinnovo lo fa **uno solo** (`refreshLockedUntil`), e si scrive
 * solo se `version` è quella letta. Chi arriva mentre un altro rinnova non
 * chiama il fornitore: aspetta, e usa il token nuovo appena salvato.
 */

export function contestoDiCifratura(venueId: string, installationId: string): string {
  return `integrazione:${venueId}:${installationId}`;
}

export function custodiaPronta(): boolean {
  return cifraturaAttiva();
}

function cifraSegreti(venueId: string, installationId: string, segreti: Segreti): string {
  if (!cifraturaAttiva()) {
    throw new ErroreIntegrazione("ENCRYPTION_UNAVAILABLE", "CHIAVE_CIFRATURA non configurata");
  }
  return cifraLegato(JSON.stringify(segreti), contestoDiCifratura(venueId, installationId));
}

export async function salvaCredenziali(
  installazione: { id: string; venueId: string },
  nuove: CredenzialiNuove,
): Promise<void> {
  const secretCiphertext = cifraSegreti(installazione.venueId, installazione.id, nuove.segreti);
  await db.integrationCredential.upsert({
    where: { installationId: installazione.id },
    create: {
      installationId: installazione.id,
      venueId: installazione.venueId,
      kind: nuove.kind,
      secretCiphertext,
      scopes: nuove.scopes,
      accessTokenExpiresAt: nuove.accessTokenExpiresAt,
      refreshTokenExpiresAt: nuove.refreshTokenExpiresAt,
    },
    update: {
      kind: nuove.kind,
      secretCiphertext,
      scopes: nuove.scopes,
      accessTokenExpiresAt: nuove.accessTokenExpiresAt,
      refreshTokenExpiresAt: nuove.refreshTokenExpiresAt,
      version: { increment: 1 },
      rotatedAt: new Date(),
    },
  });
}

/** Aggiunge segreti a quelli che ci sono (per esempio la password del webhook). */
export async function aggiungiSegreti(
  installazione: { id: string; venueId: string },
  aggiunti: Segreti,
): Promise<void> {
  const riga = await db.integrationCredential.findFirst({
    where: { installationId: installazione.id, venueId: installazione.venueId },
  });
  if (!riga) throw new ErroreIntegrazione("AUTH_EXPIRED", "Nessuna credenziale da aggiornare");
  const attuali = decifra(riga.secretCiphertext, installazione);
  const { count } = await db.integrationCredential.updateMany({
    where: { id: riga.id, version: riga.version },
    data: {
      secretCiphertext: cifraSegreti(installazione.venueId, installazione.id, { ...attuali, ...aggiunti }),
      version: { increment: 1 },
    },
  });
  /* Un rinnovo del token è passato in mezzo: si riprova una volta sulla
     versione nuova, altrimenti la password del webhook andrebbe persa e il
     fornitore ci manderebbe eventi che non sapremmo più riconoscere. */
  if (count === 0) {
    const di_nuovo = await db.integrationCredential.findFirstOrThrow({ where: { id: riga.id } });
    const nuovi = decifra(di_nuovo.secretCiphertext, installazione);
    const r = await db.integrationCredential.updateMany({
      where: { id: riga.id, version: di_nuovo.version },
      data: {
        secretCiphertext: cifraSegreti(installazione.venueId, installazione.id, { ...nuovi, ...aggiunti }),
        version: { increment: 1 },
      },
    });
    if (r.count === 0) throw new ErroreIntegrazione("CONFLICT", "Credenziali cambiate durante l'aggiornamento");
  }
}

function decifra(testo: string, installazione: { id: string; venueId: string }): Segreti {
  return JSON.parse(decifraLegato(testo, contestoDiCifratura(installazione.venueId, installazione.id))) as Segreti;
}

export type CredenzialiLette = {
  segreti: Segreti;
  version: number;
  kind: string;
  scopes: string[];
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
};

/**
 * Le credenziali di un'installazione, **filtrate anche per locale**.
 *
 * Il doppio filtro non è ridondante: `installationId` basterebbe a trovare
 * la riga, ma è il `venueId` che viene dal contesto della richiesta a
 * garantire che sia la riga di questo ristorante.
 */
export async function leggiSegreti(installazione: { id: string; venueId: string }): Promise<CredenzialiLette | null> {
  const riga = await db.integrationCredential.findFirst({
    where: { installationId: installazione.id, venueId: installazione.venueId },
  });
  if (!riga) return null;
  return {
    segreti: decifra(riga.secretCiphertext, installazione),
    version: riga.version,
    kind: riga.kind,
    scopes: riga.scopes,
    accessTokenExpiresAt: riga.accessTokenExpiresAt,
    refreshTokenExpiresAt: riga.refreshTokenExpiresAt,
  };
}

export async function cancellaCredenziali(installazione: { id: string; venueId: string }): Promise<void> {
  await db.integrationCredential.deleteMany({
    where: { installationId: installazione.id, venueId: installazione.venueId },
  });
}

/** Con quanto anticipo si rinnova un token che sta per scadere. */
export const MARGINE_RINNOVO_MS = 2 * 60_000;

export function daRinnovare(c: Pick<CredenzialiLette, "accessTokenExpiresAt">, adesso = Date.now()): boolean {
  return !!c.accessTokenExpiresAt && c.accessTokenExpiresAt.getTime() - adesso < MARGINE_RINNOVO_MS;
}

/** Quanto dura il diritto a rinnovare: più del tempo massimo di una chiamata (15 s). */
export const DURATA_LEASE_RINNOVO_MS = 20_000;
const PAUSA_ATTESA_MS = 200;

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Credenziali pronte all'uso: rinnovate se stanno per scadere.
 *
 * ## Uno solo rinnova, gli altri aspettano
 *
 * Il rinnovo si **prende in carico** con una scrittura condizionata su
 * `refreshLockedUntil` (come i lavori della coda: `PENDING → RUNNING`). Chi
 * la vince chiama il fornitore e salva; chi la perde non chiama niente —
 * aspetta che la versione cambi e usa il token nuovo. Se il vincitore muore a
 * metà, il suo diritto scade dopo `DURATA_LEASE_RINNOVO_MS` e un altro lo
 * riprende.
 *
 * Senza, con un fornitore che accetta ogni token di rinnovo una volta sola,
 * il perdente riceveva `invalid_grant` prima che il vincitore avesse salvato,
 * e dichiarava scaduto un accesso che stava solo cambiando: l'integrazione
 * finiva in «ricollega» per un difetto nostro. L'ha trovato la prova
 * `integrazioni-piattaforma`, con due rinnovi lanciati insieme.
 *
 * `rinnova` riceve i segreti attuali e restituisce i nuovi: è la funzione
 * dell'adattatore, avvolta dal servizio con il suo client HTTP.
 */
export async function credenzialiFresche(
  installazione: { id: string; venueId: string },
  adattatore: Pick<IntegrationAdapter, "rinnovaAutenticazione">,
  rinnova: (segreti: Segreti) => Promise<CredenzialiNuove>,
): Promise<CredenzialiLette> {
  const dove = { installationId: installazione.id, venueId: installazione.venueId };
  const scadenzaAttesa = Date.now() + DURATA_LEASE_RINNOVO_MS + 2_000;

  for (;;) {
    const lette = await leggiSegreti(installazione);
    if (!lette) throw new ErroreIntegrazione("AUTH_EXPIRED", "Nessuna credenziale salvata");
    if (!daRinnovare(lette) || !adattatore.rinnovaAutenticazione) return lette;

    const adesso = new Date();
    const { count: presa } = await db.integrationCredential.updateMany({
      where: {
        ...dove,
        version: lette.version,
        OR: [{ refreshLockedUntil: null }, { refreshLockedUntil: { lt: adesso } }],
      },
      data: { refreshLockedUntil: new Date(adesso.getTime() + DURATA_LEASE_RINNOVO_MS) },
    });

    if (presa === 0) {
      /* Qualcun altro sta rinnovando (o ha appena finito): si aspetta il suo
         risultato, senza chiamare il fornitore. */
      if (Date.now() > scadenzaAttesa) {
        throw new ErroreIntegrazione("TIMEOUT", "Rinnovo dell'accesso in corso da troppo tempo");
      }
      await pausa(PAUSA_ATTESA_MS);
      continue;
    }

    let nuove: CredenzialiNuove;
    try {
      nuove = await rinnova(lette.segreti);
    } catch (err) {
      await db.integrationCredential.updateMany({
        where: { ...dove, version: lette.version },
        data: { refreshLockedUntil: null },
      });
      throw normalizzaErrore(err);
    }

    const { count } = await db.integrationCredential.updateMany({
      where: { ...dove, version: lette.version },
      data: {
        secretCiphertext: cifraSegreti(installazione.venueId, installazione.id, nuove.segreti),
        scopes: nuove.scopes.length ? nuove.scopes : lette.scopes,
        accessTokenExpiresAt: nuove.accessTokenExpiresAt,
        refreshTokenExpiresAt: nuove.refreshTokenExpiresAt ?? lette.refreshTokenExpiresAt,
        version: { increment: 1 },
        rotatedAt: new Date(),
        refreshLockedUntil: null,
      },
    });

    if (count === 0) {
      /* La riga è cambiata sotto di noi mentre avevamo il diritto: solo una
         nuova autenticazione (il ristoratore che ricollega) può farlo. Vale
         la sua, non la nostra. */
      logAttenzione("integrazione.rinnovo_superato", { installazione: installazione.id });
      const dopo = await leggiSegreti(installazione);
      if (dopo) return dopo;
      throw new ErroreIntegrazione("AUTH_EXPIRED", "Credenziali rimosse durante il rinnovo");
    }

    return {
      segreti: nuove.segreti,
      version: lette.version + 1,
      kind: nuove.kind,
      scopes: nuove.scopes.length ? nuove.scopes : lette.scopes,
      accessTokenExpiresAt: nuove.accessTokenExpiresAt,
      refreshTokenExpiresAt: nuove.refreshTokenExpiresAt ?? lette.refreshTokenExpiresAt,
    };
  }
}
