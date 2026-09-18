# Tavolo Voice — architettura e piano

**Fase 0: audit.** Scritto il 18 settembre 2026, prima di toccare codice.

Il repository indicato nel brief (`BlackFoxMedia2026/foodtech`) non esiste con
quel nome: quello vero è **`BlackFoxMedia2026/foodtech-app`**, cartella di
lavoro `/Users/lucamoncalvo/tavolo-app`. Tutto quello che segue riguarda quello.

---

## 0. Il rilievo che cambia il piano

**Nello schema ci sono già tre tabelle per la telefonia, e nessuna riga di
prodotto le legge.**

| Tabella | Dal | Chi la scrive | Chi la legge | Cosa copre |
|---|---|---|---|---|
| `CallLog` | baseline | solo `prisma/demo-vetrina.ts` | **nessuno** | chiamata, `recordingUrl`, `transcript`, `intent`, durata, legame a una bozza |
| `MissedCall` | baseline | solo la demo | **nessuno** | chiamate perse con `attempts` e `callbackSentAt` |
| `VoiceBookingDraft` | baseline | solo la demo | **nessuno** | la bozza di prenotazione raccolta al telefono, con `bookingId` |
| `PhoneCall` | 17 set 2026 | il prodotto | il prodotto | chiamata, stato, ospite, prenotazione |

C'era già un abbozzo di questo stesso progetto, arrivato fino allo schema e mai
collegato a niente — la stessa cosa che era `ApiToken` prima di ieri. E il 17
settembre ne ho aggiunta una quarta senza accorgermene.

**Verificato in produzione** (18 settembre): due righe in ognuna delle tre,
tutte del 26 aprile 2026 e tutte con numeri finti (`+390000000001`), scritte da
`demo-vetrina.ts`. Due e non una perché quel seed **non è idempotente**: girato
due volte, ha scritto due volte. Nessuna riga di prodotto.

**Decisione: una tabella sola.** `PhoneCall` resta la verità — è l'unica che il
prodotto scrive e legge — e si **estende** con quello che le altre tre
anticipavano. Le tre si cancellano, e con loro le righe della demo: sono dati
finti, non storia di nessun cliente. `demo-vetrina.ts` va aggiornato nello
stesso passo, o alla prossima esecuzione fallirebbe su tabelle che non ci sono.

Il contrario (adottare `CallLog`) vorrebbe dire migrare dati veri verso una
tabella mai usata per il gusto di un nome, e riscrivere sette moduli che
funzionano.

---

## 1. Architettura attuale

### Stack
Next.js 14.2 App Router (RSC, nessuna server action: le scritture passano da
API routes), TypeScript 5.6, Prisma 5.22 + PostgreSQL (Neon), NextAuth 4.24
(JWT), Tailwind 3.4, Recharts, Vitest 2.1, Playwright 1.49. Vercel.

### Multi-tenant
`Organization → Venue → VenueMembership`. **Ogni** lettura e scrittura filtra
per `venueId`, che arriva dal server (`getActiveVenue` / `requireVenueApi`) e
mai dal corpo di una richiesta. Non c'è RLS: l'isolamento è nel codice, ed è
verificato da `tests/isolamento-locali.test.ts`.

### Tempo reale
**Non ci sono WebSocket** (Vercel), e non c'è SSE. C'è una sonda condivisa:
`/api/servizio-versione` risponde con una firma corta ogni 5 secondi, e la
fotografia intera si scarica solo quando la firma cambia
(`src/lib/use-servizio-vivo.ts`, `src/server/versione-servizio.ts`). Le
chiamate sono già dentro quella firma. Dal 17 settembre la fotografia porta
anche la **propria** versione, così niente si perde nei primi cinque secondi.

Voice **riusa questa sonda**. Non si introduce un secondo meccanismo.

### Permessi
`src/lib/abilities.ts`: otto capacità, matrice per cinque ruoli. Nessuna
capacità è specifica del telefono: oggi Voice usa `manage_bookings` (chi
risponde) e `manage_venue` (chi configura).

### Registri
- `AuditLog` (org+venue, `action`/`entityType`/`diff`/`ip`) — usato dalle rotte.
- `BookingEvent` (`CREATED`, `STATUS_CHANGED`, `TIME_CHANGED`, …) — **scritto
  da nessuna parte nel codice attuale**: è il quinto campo mai scritto di
  questo schema, e va acceso da Voice (§41 del brief) o resta una promessa.

### Messaggi
`src/server/messaging/send.ts` è già l'astrazione giusta: un punto unico,
`MessageLog` con `bookingId + kind` come chiave anti-doppione, coda
(`enqueueMessage`) o invio immediato (`sendMessage`), e **`SMS` e `WHATSAPP`
hanno il posto pronto in `PROVIDERS` ma nessun fornitore configurato** — chi
chiama riceve `no_channel` e nessuna interfaccia li offre. Il recupero delle
chiamate perse si innesta qui e dichiarerà lo stato invece di finto-funzionare.

### AI
Esiste già un layer a strumenti controllati: `src/server/ai/tool-registry.ts`
(15 strumenti), `permission-guard.ts` (`requireAbility`), `llm-provider.ts` con
`openai-adapter.ts`, `usage-service.ts` con tetto mensile, `AgentConversation`
/ `AgentUsage` in tabella. Gli strumenti di oggi sono **tutti in lettura**.
L'AI receptionist riusa questo, aggiungendo strumenti di scrittura.

### Disponibilità
`src/server/availability.ts`: `checkAvailability` / `assertAvailability` con
codici (`VENUE_CLOSED`, `SHIFT_FULL`, `TABLE_TOO_SMALL`, …) e il concetto di
**canale**: `pubblico` applica le regole severe, `interno` le salta perché chi
risponde al telefono alle 20:40 deve poter scrivere quella prenotazione.
**Voice non costruisce un secondo motore**: usa questo, con `pubblico` per
*misurare* e `interno` per *scrivere*.

### Prenotazioni
`createBooking(venueId, dati, opts)`: `skipAvailabilityCheck`, `canale`,
`idempotencyKey` (indice unico su `Booking.idempotencyKey`), `status` imposto
**solo da codice server** (il `status` dentro i dati è ignorato di proposito).
`trovaOCreaOspite` deduplica per email e per **ultime nove cifre** del telefono
(corretto ieri: prima confrontava le stringhe e creava doppioni).

### Ricerca globale
`src/server/ricerca.ts` + `src/components/shell/ricerca-globale.tsx`: cerca
ospiti, prenotazioni, tavoli — e già **per cifre del telefono**. Aggiungere le
chiamate è una query in più, non un meccanismo nuovo.

---

## 2. Cos'è già fatto di questo brief

Costruito il 17 settembre 2026 (PR #124–#134), tutto in produzione:

| § | Cosa | Stato |
|---|---|---|
| 7 | Identificazione del chiamante per ultime 9 cifre, con indice | **fatto** |
| 8 | Caller card con nome, VIP, allergie, no-show, prossima prenotazione | **fatto**, ma solo in `/service` |
| 9 | Chiamante sconosciuto con azioni | **fatto** |
| 10 | Contextual booking: la prossima prenotazione appare senza cercarla | **fatto** |
| 12–13 | `/telefono`: storico, righe, filtro «da richiamare» | **parziale** (manca l'header con i numeri) |
| 15 | Chiamate perse visibili con azioni | **parziale** (manca WhatsApp/SMS) |
| 39 | Tabella chiamata | **parziale** (manca `outcome`, `handler`, `voiceNumberId`, recording, transcript, summary) |
| 42 | Normalizzazione telefono | **fatto** (`src/lib/telefono.ts`) |
| 43 | Merge CRM | **fatto** (riusa `trovaOCreaOspite`) |
| 48 | Booking ↔ chiamata | **parziale**: il legame esiste (`PhoneCall.bookingId`), manca `source = VOICE` |
| 49 | Guest ↔ chiamate | **parziale**: riquadro «Telefonate», non una timeline unica |
| 66/88 | Idempotenza webhook | **fatto**: unico su `(venueId, externalId)` |
| 70–72 | Da chiamata a prenotazione con telefono precompilato | **fatto** (era rotto: il link perdeva il numero) |
| 11 | Controlli chiamata | **parziale**: rispondere sì, trasferire/attesa no — e **non** si mostrano finti |
| 25–27 | Prenotazione dal risponditore a tasti | **fatto** senza AI |

E fuori da Tavolo, in `blackfox-voice`: la licenza firmata Ed25519 che accende
le funzioni, la chiave di collegamento emessa da Tavolo, e il ponte che manda
gli eventi di chiamata.

---

## 3. Cosa manca, e cosa costa

### A. Il modello (§38–40)

`PhoneCall` si estende. **Niente `VoiceCall` nuovo**: rinominare una tabella
viva per allinearla a un nome del brief costa una migrazione rischiosa e non
aggiunge niente. Il nome nel codice resta `PhoneCall`, il nome nel prodotto è
«Tavolo Voice».

Campi nuovi su `PhoneCall`:
- `outcome PhoneCallOutcome?` — l'enum dei dodici esiti del §14;
- `handler PhoneCallHandler` — `HUMAN` / `AI` / `HYBRID` / `NONE`;
- `voiceNumberId` — a quale numero è arrivata;
- `waitlistId` — quando la chiamata finisce in lista d'attesa;
- `recordingUrl`, `recordingExpiresAt`, `transcript`, `summary`;
- `direction` — oggi implicito (solo entranti).

Tabelle nuove:
- **`VoiceNumber`** — `venueId`, provider, numero esterno, numero mostrato,
  `routingMode`. Un numero appartiene a **un** locale (§37).
- **`VoiceConfiguration`** — uno per locale: modalità
  (`OFF`/`HUMAN_ONLY`/`HUMAN_FIRST`/`AI_FIRST`), `ringTimeoutSeconds`, routing
  per `OPEN`/`CLOSED`/`BUSY`/`NO_ANSWER`, recupero chiamate perse, recording,
  persona dell'AI.
- **`VoiceCallback`** — la coda «da richiamare» (§17), con `attempts` e
  `resolvedAt`. È quello che `MissedCall` voleva essere.
- **`VoiceCRMInsight`** — le informazioni rilevate in chiamata, **da
  approvare** (§22): `PENDING`/`SAVED`/`IGNORED`. Non si scrive niente nel
  profilo di un ospite senza che una persona prema «salva».
- **`VoiceKnowledgeItem`** — la base di conoscenza per l'AI (§59).

Tabelle da **cancellare**: `CallLog`, `MissedCall`, `VoiceBookingDraft`
(+ enum `CallDirection`, `CallStatus`, `DraftStatus` se non usati altrove).
Prima si verifica in produzione che siano vuote.

`BookingSource` guadagna **`VOICE`**; chi l'ha gestita (AI o persona) sta su
`PhoneCall.handler`, non in un secondo valore dell'enum (§53).

### B. L'astrazione del fornitore (§3, §11, §55, §66, §92)

Oggi il fornitore è implicito: `blackfox-voice` spinge gli eventi e Tavolo li
riceve. Funziona, e non è un'astrazione.

`src/server/voice/provider.ts`:

```ts
type VoiceCapabilities = {
  inbound: boolean; outbound: boolean; transfer: boolean; hold: boolean;
  dtmf: boolean; recording: boolean; transcript: boolean; webrtc: boolean; ai: boolean;
};

interface VoiceProvider {
  readonly nome: string;
  readonly capacita: VoiceCapabilities;
  verificaFirmaWebhook?(req: Request, corpo: string): boolean;
  leggiEvento(corpo: unknown): EventoChiamata | null;
  // opzionali, dichiarati da `capacita`
  chiama?(...): Promise<...>;
  trasferisci?(...): Promise<...>;
  registrazione?(...): Promise<...>;
}
```

Due implementazioni: **`BlackFoxVoiceProvider`** (quello vero, senza outbound
né trasferimento oggi) e **`MockVoiceProvider`** per lo sviluppo. L'interfaccia
guida anche i pulsanti: **quello che il fornitore non sa fare non compare**
(§11), e non si mostrano comandi finti.

`verificaFirmaWebhook` è opzionale perché oggi l'autenticazione è il token
`tvl_…` in `Authorization`, che è più forte di una firma: identifica il locale.
Quando arriverà un fornitore che firma, si aggiunge senza toccare le rotte.

### C. Il pannello globale (§6, §62, §63)

Oggi il riquadro della chiamata vive in `/service`. Deve vivere nel guscio
(`src/app/(app)/layout.tsx`), sopra ogni pagina:
- **scrivania**: riquadro flottante in basso a destra;
- **tablet**: pannello che entra da destra;
- **telefono**: foglio dal basso.

Si alimenta dalla stessa sonda, e **non** con un secondo giro di
interrogazioni. Nella testata: l'icona del telefono con il numero delle
**azioni pendenti** (perse + da richiamare), non delle chiamate totali.

### D. Il centro operativo (§12–14, §17, §18)

`/telefono` diventa: fascia dei numeri di oggi, timeline, coda «da richiamare»,
voicemail quando c'è. Densità operativa (§77): righe, non schede.

### E. Recupero delle chiamate perse (§16)

Innesto su `messaging/send.ts`, `kind = "voice.missed_recovery"` (l'anti-doppione
è già lì). Impostazioni per canale, attesa, testo. **Dichiara** che SMS e
WhatsApp non sono configurati invece di offrire un interruttore che non fa
niente.

### F. Analytics (§50–52)

Nuova vista `telefono` in `src/lib/viste-insights.ts`. Metriche misurate
(chiamate, risposte, perse, recuperate, prenotazioni da Voice, coperti). Il
valore attribuito **solo** se esiste una base affidabile, e marcato
`MISURATO`/`STIMATO` come il resto del prodotto.

### G. Permessi (§45)

Capacità nuove: `view_voice`, `handle_voice`, `view_voice_recordings`,
`view_voice_transcripts`, `manage_voice`, `view_voice_analytics`. Matrice:
MANAGER tutte; RECEPTION `handle`+`view`; WAITER solo il contesto del
chiamante; MARKETING solo analitiche; READ_ONLY niente.

### H. AI receptionist (§23–33, §68, §69)

Riusa `tool-registry` + `permission-guard` + `llm-provider`. Strumenti di
**scrittura** nuovi, ognuno con la sua capacità: `create_booking`,
`update_booking`, `cancel_booking`, `add_waitlist`, `create_callback`,
`transfer_to_human`, e di lettura `get_availability`, `get_opening_hours`,
`get_venue_info`, `get_menu_info`.

Tre regole non negoziabili:
1. **l'AI non dice «confermato» prima che lo strumento sia riuscito** (§68);
2. la validazione si rifà **sul server** al momento della scrittura, non su
   quello che l'AI aveva letto trenta secondi prima (§69: due chiamate che
   prendono lo stesso tavolo);
3. se un dato non c'è, «faccio verificare dal personale» — non si inventa.

### I. Simulatore (§92)

`/api/dev/voice/simula`, attivo **solo** quando `NODE_ENV !== "production"`, e
il controllo sta nella rotta, non in una variabile che si può accendere.

---

## 4. Impatto sul progetto esistente

| Area | Impatto |
|---|---|
| `PhoneCall` | additivo |
| `CallLog`, `MissedCall`, `VoiceBookingDraft` | **cancellate** (verificate vuote) |
| `BookingSource` | un valore in più: additivo, nessun dato rotto |
| `abilities.ts` | sei capacità in più; la matrice cambia per MANAGER/RECEPTION/MARKETING |
| `layout.tsx` | un componente in più nel guscio |
| `viste-insights.ts` | una vista in più (il test `navigazione.test.ts` va aggiornato) |
| `messaging/send.ts` | nessuna modifica: si usa |
| `availability.ts` | nessuna modifica: si usa |
| `createBooking` | nessuna modifica: si usa con `source: VOICE` |
| `ai/tool-registry.ts` | strumenti in più; i vecchi non si toccano |
| Sonda del servizio | nessuna modifica: già comprende le chiamate |
| Design | nessuna modifica a palette, scala, raggi, componenti |

**Nessuna funzione esistente viene rimossa.**

---

## 5. Fasi, con la verifica alla fine di ognuna

Alla fine di ogni fase: `tsc`, `lint`, prove unitarie, prove end-to-end,
build, e la sonda di leggibilità quando la fase tocca l'interfaccia.

| Fase | Cosa | Rischio |
|---|---|---|
Le fasi 1–5 sono fatte: schema (#135), fornitore e capacità (#136), pannello
globale della chiamata (#137), esiti e coda delle richiamate (#138), recupero
delle chiamate perse e notifiche (#139), la storia di una prenotazione (#140), i permessi del telefono e lo stato del
fornitore (#141), i numeri del telefono nelle analitiche (#142), gli strumenti di scrittura
dell'assistente (#143).

**Fase 9, quello che è cambiato rispetto al piano.** Gli strumenti di scrittura
sono tre e non sei — `prenota`, `metti_in_attesa`, `crea_richiamata` — perché
sono i tre che hanno una schermata dietro di cui copiare il permesso e un caso
d'uso al telefono. `update_booking`, `cancel_booking` e `transfer_to_human`
arrivano con il risponditore (fase 10), dove servono.

E la regola 2 è implementata nel verso **raggiungibile**: il controllo si rifà
al momento della scrittura e quello che è cambiato in mezzo si **dice**, invece
di rifiutare. La prima versione rifiutava sui conflitti di tavolo — codice che
non poteva scattare, perché l'anteprima non propone un tavolo.

**Panoramica, nella fase 8: niente.** Il piano diceva «Servizio + Panoramica +
analitiche». Servizio ce l'ha dalla fase 3 (le due righe che chiedono un
gesto), le analitiche arrivano adesso. La Panoramica **no**, e per una ragione:
quello che il telefono ha da dire adesso lo dice già il bollino in testata, che
sta su ogni pagina compresa quella — e le chiamate perse le dice la campanella
con l'ora dentro. Una terza copia degli stessi due numeri sarebbe il posto in
cui uno dei tre invecchia. Una prenotazione raccolta dal risponditore invece
suona già in campanella da sé, perché nasce `PENDING`: «arrivata da
risponditore, aspetta la tua conferma».

**Cambio di piano nella fase 6.** Il piano diceva «accendere `BookingEvent`».
Guardando cosa ci sarebbe finito dentro si è visto che ogni evento ha già la
sua casa — la riga stessa per la nascita, `PhoneCall` per la telefonata,
`MessageLog` per i messaggi con il loro esito, `AuditLog` con la differenza per
chi ha cambiato cosa — e che accenderla voleva dire scrivere una **seconda
copia** di quello che c'è. `BookingEvent` è la quarta tabella morta trovata in
questo prodotto, ed è stata segnata superata come le tre del telefono: la
storia si legge dai fatti (`src/server/storia-prenotazione.ts`).

| **1** | Consolidamento dello schema: estendere `PhoneCall`, cancellare le tre morte (+ `demo-vetrina.ts`), `VoiceNumber` + `VoiceConfiguration`, `BookingSource.VOICE` | **il più alto**: è l'unico passo distruttivo, e cancella sei righe di demo |
| **2** | Astrazione del fornitore + capacità + simulatore | basso |
| **3** | Pannello globale della chiamata (scrivania/tablet/telefono) + indicatore in testata | medio (tocca il guscio) |
| **4** | Esiti, `handler`, `VoiceCallback`, il centro operativo `/telefono` | basso |
| **5** | Recupero chiamate perse + notifiche `MISSED_CALL` | basso |
| **6** | `BookingEvent` acceso da Voice, `source = VOICE`, timeline dell'ospite | medio (accende un registro mai scritto) |
| **7** | Permessi Voice + impostazioni + stato del fornitore | medio (cambia la matrice dei ruoli) |
| **8** | Servizio + Panoramica + analitiche | basso |
| **9** | Strumenti di scrittura per l'AI, con le tre regole | alto (scrive prenotazioni) |
| **10** | AI receptionist, routing, base di conoscenza | alto |
| **11** | Registrazione, trascrizione, riassunto, insight da approvare | medio (privacy) |
| **12** | Rifinitura telefono/tablet, QA, prestazioni | basso |

Le fasi 9–11 dipendono da un fornitore che sappia fare AI e registrazione:
oggi `blackfox-voice` non espone nessuna delle due. Si costruisce il layer e si
dichiara `requires provider`.

---

## 6. Quello che non si farà, e perché

- **Non si rinomina `PhoneCall` in `VoiceCall`.** È viva e con dati; il
  guadagno sarebbe un nome.
- **Non si costruisce un secondo motore di disponibilità** (§26 lo vieta, e
  aveva ragione).
- **Non si costruisce un secondo CRM, una seconda agenda, una seconda coda.**
- **Non si costruisce un tempo reale nuovo**: la sonda a 5 secondi c'è e
  funziona.
- **Non si mostrano comandi che il fornitore non sa eseguire.**
- **Non si scrive niente nel profilo di un ospite senza approvazione umana.**
- **Non si finge che SMS e WhatsApp funzionino** finché non c'è un fornitore.
