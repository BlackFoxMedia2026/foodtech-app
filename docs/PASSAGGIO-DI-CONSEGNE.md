# Tavolo · passaggio di consegne

Questo file è **il prompt** da dare a chi prende in mano il progetto. Si può
incollare in una sessione di Claude Code aperta nella cartella del repository,
oppure leggere dall'inizio alla fine come guida.

Ultimo aggiornamento: **10 settembre 2026**, dopo la PR #117.

---

## 1. Che cos'è

**Tavolo** è un gestionale SaaS per ristoranti, beach club e gruppi hospitality
di fascia medio-alta. In un'unica interfaccia: prenotazioni, mappa sala, CRM
ospiti, carta e food cost, esperienze, marketing e analisi.

- **Repository:** `BlackFoxMedia2026/foodtech-app`
- **Produzione:** <https://foodtech-app.vercel.app> — progetto Vercel
  `blackfoxmedia/foodtech-app`
- **Vetrina dimostrativa** (vive in produzione): accesso `owner@tavolo.demo`,
  password `tavolo2026`. Sono credenziali pubbliche, già nel README.
- **Lingua del prodotto e del codice: italiano.** Interfaccia, messaggi,
  commenti, nomi di funzioni nuove, titoli delle PR: tutto in italiano. Il
  codice più vecchio è in inglese e si può lasciare com'è.

## 2. Stack

| | |
|---|---|
| Framework | Next.js **14.2.18**, App Router, React Server Components |
| Linguaggio | TypeScript 5.6 |
| Stile | Tailwind CSS 3.4 + primitive Radix in stile shadcn |
| Database | PostgreSQL (Neon in produzione) + Prisma 5.22 |
| Accesso | NextAuth 4.24, provider Credentials, sessione JWT |
| Grafici | Recharts 2.13 |
| Prove | Vitest 2.1 (unitarie) + Playwright 1.49 (percorsi) |

Node **20 LTS** consigliato (le versioni molto recenti fanno comparire avvisi
`EBADENGINE` su una dipendenza di sviluppo, innocui).

**Niente server actions:** le scritture passano da route API sotto
`src/app/api/**`, e ogni route chiama `requireVenueApi(abilità?)`.

## 3. Partire da zero

```bash
git clone git@github.com:BlackFoxMedia2026/foodtech-app.git
cd foodtech-app
npm install

# Un database vuoto e dedicato. Mai puntare a quello di produzione.
docker run --name tavolo-pg -e POSTGRES_USER=tavolo -e POSTGRES_PASSWORD=tavolo \
  -e POSTGRES_DB=tavolo_dev -p 5432:5432 -d postgres:16

cp .env.example .env.local     # poi vedi il punto 4
npm run db:push                # schema
npm run db:seed                # dati dimostrativi
npm run dev                    # http://localhost:3000
```

Accesso locale: `owner@tavolo.demo` / `tavolo2026`.

## 4. Variabili d'ambiente

`.env.example` è commentato riga per riga: **leggilo, non copiarlo alla
cieca**. Il minimo per lavorare in locale:

```
DATABASE_URL=postgresql://tavolo:tavolo@localhost:5432/tavolo_dev
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
```

Facoltative, e ognuna spegne una funzione se manca (il prodotto lo dice
nell'interfaccia, non si rompe): `BREVO_*` (invio campagne), `RESEND_*`
(email transazionali), `BLOB_READ_WRITE_TOKEN` (caricamento piantine e
contratti), `OPENAI_API_KEY` (Agente), `CHIAVE_CIFRATURA` (password Wi-Fi
cifrata a riposo), `CRON_SECRET` (protegge `/api/cron/*`), `STRIPE_*`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DEMO_PUBBLICA`.

> **I segreti di produzione li chiedi a Luca.** Non sono in questo file, non
> sono nel repository, e non vanno incollati in una chat.

Per far girare le prove automatiche senza farsi bloccare dal limite di
frequenza (accesso: **10 tentativi ogni 10 minuti**) si possono alzare
`RATE_LIMIT_LOGIN` e compagnia in locale.

## 5. Comandi

```bash
npm run dev            # sviluppo
npm run build          # prisma generate + migrazioni sicure + next build
npm run typecheck      # tsc --noEmit
npm run lint
npm test               # 1050 prove unitarie (vitest, fileParallelism: false, TZ=UTC)
npm run test:e2e       # 10 percorsi completi (Playwright)
npm run db:studio      # ispezione del database
npm run db:migrate     # nuova migrazione in sviluppo
npm run db:status      # stato delle migrazioni
```

Due sonde che vivono in repo e vanno usate prima di consegnare lavoro visivo:

```bash
# leggibilità: contrasto sul fondo reso + testo tagliato, su 129 schermate
# in tre dimensioni di schermo (scrivania, tablet, telefono)
BASE=http://localhost:3100 OUT=/tmp/leg.json node scripts/audit-leggibilita.mjs

# audit visivo: scorrimento, errori in console, schermate vuote, fotografie
OUT=/tmp/foto VENUE=aurora-bistrot BOOKING=… GUEST=… CAMPAIGN=… SURVEY=… \
  SEZIONI=1,2,3,4 node scripts/audit-visivo.mjs
```

**`npm run test:e2e` cancella `.next`:** dopo averlo eseguito, ricostruisci
(`npm run build`) prima di riavviare un server di produzione locale.

## 6. Come si consegna il lavoro

```
tuo-branch  →  PR verso main  →  merge  →  Vercel pubblica da solo
```

- **Mai committare su `main`.** `feature/luca` è il branch di Luca: fatti il
  tuo (`feature/<nome>`).
- Prima di aprire una PR: `typecheck`, `lint`, `npm test`, `npm run test:e2e`,
  `npm run build`. Tutti verdi.
- Dopo il merge, **verifica in produzione**, non fidarti del verde della CI. Il
  deploy vive in un paio di minuti; il modo affidabile di sapere quale
  deployment è vivo è `npx vercel inspect https://foodtech-app.vercel.app`.
- Le PR di questo progetto si leggono: dicono **cosa non funzionava**, con i
  numeri misurati, e cosa è stato verificato. Guarda le ultime (#100–#117) per
  il tono.

## 7. Vincoli da rispettare, non negoziabili

1. **La sala è di Filippo Limone.** `src/app/(app)/floor/**` e
   `src/components/floor/**` non si toccano senza parlargli. Se un cambio a un
   token del tema li influenza, va detto nella PR. (Errore già fatto: la voce
   «Sala» del menu è stata spostata deducendo dal nome del file che fosse un
   editor di piantine. Non lo era.)
2. **Migrazioni:** si usa `npm run db:migrate`, e `db:push` **solo in locale**.
   Il build applica le migrazioni con un freno (`scripts/migrate-safe.ts`):
   un'anteprima applica solo migrazioni che *aggiungono*, perché su Vercel il
   database delle anteprime è quello di produzione. Leggi quel file prima di
   creare una migrazione che porta via dati.
3. **Seed:** `prisma/seed.ts` si rifiuta di girare se `DATABASE_URL` non
   contiene `dev` o `test`, salvo `SEED_DEMO_PRODUZIONE=1` esplicito. La
   vetrina in produzione si allinea con
   `scripts/allinea-demo-produzione.sh`, che fa una copia di sicurezza prima.
4. **I pagamenti non si toccano** e non si propongono: è un argomento che apre
   Luca quando vuole lui.
5. **Il menu di navigazione resta orizzontale.**
6. Non toccare la password del database di produzione: la ruota Luca dalla
   console Neon.

## 8. Architettura, in breve

```
Organization (gruppo)
└── Venue (locale)
    ├── Room + Table (mappa sala)
    ├── Shift (turni con capienza)
    ├── Guest (CRM)
    ├── Booking → Order → Payment
    ├── WaitlistEntry (coda)
    ├── Experience + Ticket
    └── Campaign, Coupon, GiftCard, QrCode, Survey
```

- **Multi-tenant per `venueId`.** Ogni query e ogni route passano da
  `lib/tenant.ts → getActiveVenue()`; le API da
  `requireVenueApi(abilità?)`. I permessi stanno in `src/lib/abilities.ts`.
- **Le funzioni pure condivise stanno in `src/lib/`.** Regola imparata a
  caro prezzo: dal server **non si possono leggere valori** esportati da un
  modulo `"use client"` — attraversano il confine solo i riferimenti ai
  componenti. Costanti, tipi e funzioni pure vanno in `lib/`, altrimenti la
  pagina si rompe in produzione con un messaggio muto.
- **La logica di dominio sta in `src/server/`**, provata da unità con dati
  finti: `availability`, `no-show`, `rotazione`, `food-cost`,
  `menu-engineering`, `guest-intelligence`, `service-intelligence`,
  `waitlist`, `campaigns`, `forecast`.
- **Tempo reale senza WebSocket** (non ci sono su Vercel):
  `/api/servizio-versione` interrogata ogni 5 secondi, e la fotografia
  completa si scarica solo quando cambia.
- **Viste indirizzabili:** lo stato dell'interfaccia sta nell'URL
  (`?vista=`, `?parte=`, `?filtro=`, `?status=`), così un link condiviso apre
  quello che vedeva chi l'ha mandato.

## 9. Le regole del prodotto che non si deducono dal codice

Sono scritte in `DESIGN.md` (sezione «Named Rules») e in `PRODUCT.md`. Le più
importanti, perché romperle è il modo più rapido di fare danni:

- **Un numero deve dichiarare la sua base.** «12 in attesa» non basta: «12
  persone». E la base non si taglia mai con `truncate`.
- **Quattro livelli di verità:** misurato / stimato / parziale / non
  disponibile. Una stima si chiama stima. Un dato che non c'è si dice, non
  diventa uno zero.
- **Una percentuale sotto dieci casi non si mostra** (`lib/quota.ts`): su
  numeri piccoli dice più di quello che sa. E con zero casi non è «troppo
  pochi», è «non è ancora accaduto niente»: due frasi diverse.
- **Un valore arrotondato per essere letto non è un ingresso di calcolo.**
- **Nel confronto fra periodi la freccia viene dal segno, il colore dal
  giudizio.** Una freccia in giù verde è corretta.
- **`accent` riempie e borda, `accent-strong` si legge.** Il terracotta pieno
  su verde scuro non è un colore da testo (2,79 : 1). Su una tinta va il
  crema, non il colore della tinta.
- **Il contrasto si misura sul fondo reso**, non sul token: schede e pagina
  hanno un gradiente più una velatura bianca al 5-7% che abbassa ogni
  rapporto di circa il 15%.
- **Le velature Tailwind stanno solo sui passi della scala** (5, 10, 15, 20…):
  `bg-cream/6` **non viene generato** e lascia il fondo trasparente, senza
  errori da nessuna parte.
- **Niente scorrimento sulle schermate operative:** `.schermo` / `.fissa` /
  `.fill` / `.fill-scroll`, una sola regione elastica per schermata.
- **Le automazioni sono un catalogo chiuso di tre.** Non aggiungerne senza
  parlarne.

## 10. Dove guardare

| documento | cosa contiene |
|---|---|
| `README.md` | avvio, stack, architettura multi-tenant |
| `PRODUCT.md` | utenti, posizionamento, principi di prodotto |
| `DESIGN.md` | tavolozza, tipografia, componenti, **le regole con nome** |
| `docs/ARCHITECTURE.md` | struttura del codice |
| `docs/SECURITY.md` | permessi, limiti di frequenza, dati personali |
| `docs/INTEGRATIONS.md` | Brevo, Resend, Blob, OpenAI |
| `docs/ROADMAP.md` | che cosa manca |
| `docs/PRODUCT_STATUS.md` | che cosa è finito e che cosa è a metà |
| `docs/TAVOLO-UX-REDESIGN-V2.md` | il cantiere visivo di settembre, con le misure |
| `docs/audit-2026-09*/` | gli audit, con i rilievi e cosa ne è stato fatto |

## 11. Stato al 10 settembre 2026

- `main` è a `5a0c769` (PR #117). Le PR **#100–#117** sono di ieri e oggi.
- **1050** prove unitarie, **10** percorsi completi, tutti verdi.
- **129 schermate** misurate su tre dimensioni di schermo: contrasto e testo
  tagliato **a zero**. Restano dei casi «da guardare», che sono falsi allarmi
  verificati a mano (la pillola VIP su bianco sfumato, la voce di menu attiva
  su pillola crema, i titoli scuri sulle schede crema della vetrina).

### Aperto, e sono decisioni di Luca

1. **I dati della vetrina dimostrativa.** La carta di produzione è stata
   inserita a mano con un food cost piatto del **32% su ogni piatto**, e questo
   fa sembrare banale la schermata «Cibo e carta», che è la più curata del
   prodotto. Nella demo tutti i 17 tavoli sono assegnati alla stessa persona, e
   nessuna seduta ha un tavolo segnato — quindi «giri per tavolo» non si
   calcola mai. La demo invecchia anche durante il giorno (righe in coda «da 25
   ore»): `scripts/allinea-demo-produzione.sh` la riallinea.
2. **Il colore del marchio del locale dimostrativo è un azzurro
   `#24E5FF`**, quindi il pulsante «Prenota» dei clienti è ciano elettrico su
   una pagina verde. Il testo ora è leggibile (si calcola dal fondo), ma il
   colore è da rivedere.
3. **I tre toni fuori tavolozza del `Badge`** (`warning`, `danger`, `info`)
   sono stati portati in tavolozza; restano fuori `pearl` e `carbon`, che sono
   i **materiali** dei livelli di fedeltà. Scelta, non dimenticanza.
4. **Il marchio dell'Agente** in alto a destra sborda dal suo pulsante e
   arriva sulla barra del menu: è **voluto** (l'immagine è il disegno finale e
   il file dice di non reinterpretarla), ma a schermo largo si nota.
5. **`StaffAssignment` contro `WaiterAssignment`**: due modelli per la stessa
   cosa, in attesa di una decisione.
6. Non fatti: trascinamento sulla sala viva, palette dei comandi, CRM fra
   locali, coda offline.

## 12. Come lavorare bene su questo progetto

Tre cose che qui pagano più di altrove:

1. **Guarda le schermate.** Le misure automatiche su 129 schermate danno zero
   difetti, e guardandole si trovano ancora: un piatto in perdita scritto come
   uno che rende, una freccia che punta al contrario, la pagina di conferma di
   un altro prodotto. La sonda non sa che cosa *dovrebbe* dire un numero.
2. **Quando trovi una regola applicata in un posto, cerca tutti gli altri
   posti che ne hanno bisogno.** È capitato tre volte in un giorno che il
   difetto stesse a **una schermata** dalla sua soluzione: la freccia del
   trend, il ricontrollo di disponibilità, la base minima delle percentuali.
   Un `skip`, un `force` o un `bypass` in un solo punto di chiamata è il
   segnale più forte che il difetto è più in basso.
3. **Verifica sui dati veri, non solo in locale.** In locale i tagli di testo
   erano zero, in produzione uno: nomi più lunghi. E misura in produzione dopo
   ogni merge.
