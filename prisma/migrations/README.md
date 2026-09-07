# Migrazioni

Da settembre 2026 lo schema del database si cambia **solo** con migrazioni versionate.
Prima il deploy eseguiva `prisma db push --accept-data-loss`: bastava un rename di colonna
perché il rilascio successivo cancellasse dati veri, senza avviso e senza modo di tornare indietro.

## Come lavorare

**In locale, per cambiare lo schema:**

```bash
npm run db:migrate        # prisma migrate dev — crea la migrazione e la applica
```

**In produzione:** ci pensa il build (`prisma migrate deploy`). Non serve fare nulla a mano.

`npm run db:push` resta disponibile **solo per esperimenti in locale**. Se lo usi, il database
si disallinea dalle migrazioni e il `migrate dev` successivo te lo segnala: in quel caso
ricrea il database locale (`db:push` su un database vuoto oppure `migrate reset`).

## Passo obbligatorio una volta sola, su ogni database che esisteva prima

`00000000000000_baseline` descrive lo schema **così com'era** il 7 settembre 2026: 72 tabelle,
82 indici. Su un database che quelle tabelle **già le ha**, non va eseguita — va solo
registrata come già applicata:

```bash
npm run db:baseline      # prisma migrate resolve --applied 00000000000000_baseline
npm run db:status        # deve dire "Database schema is up to date!"
```

⚠️ **Va fatto sul database di produzione prima del prossimo deploy.** Senza questo passo
`prisma migrate deploy` prova a creare tabelle che esistono già e il build fallisce.
Il database locale di chi ha scritto la baseline è già a posto.

Per un database **nuovo e vuoto** invece non serve niente: `migrate deploy` applica la
baseline e tutto il resto in ordine.

## Il seed non si esegue in produzione

`npm run db:seed` non fa più parte del build. Se lo esegui a mano, sappi che su
un locale demo già esistente propone di **riallineare le date** di tutte le
prenotazioni a cavallo di oggi — comodo su un database di prova, disastroso su
quello vero, dove sposterebbe di settimane anche le prenotazioni inserite a
mano.

Per questo lo spostamento non parte da solo: va chiesto esplicitamente.

```bash
SEED_ALLOW_DATE_SHIFT=1 npm run db:seed   # SOLO su un database di prova
```

Senza quella variabile il seed dice quante prenotazioni ha trovato e non tocca
niente.

## Ordine delle migrazioni quando si rinomina o si elimina

Regola: **aggiungere prima del deploy, eliminare dopo.**

1. Migrazione che *aggiunge* la colonna nuova, lasciando la vecchia al suo posto
2. Deploy del codice che scrive su entrambe e legge dalla nuova
3. Migrazione che *elimina* la colonna vecchia

Così in nessun momento il codice in esecuzione si trova davanti una colonna che non c'è più.

## Il freno sulle anteprime

Su Vercel `DATABASE_URL` è la stessa per produzione, anteprime e sviluppo, e il
build esegue le migrazioni. Il 7 settembre 2026 questo è venuto a galla nel modo
peggiore possibile: le migrazioni delle fasi 0-4 erano **già tutte in
produzione** senza che nessuno le avesse pubblicate. Le aveva applicate
l'anteprima delle richieste di modifica.

È andata bene perché erano tutte additive. Una che cancella una colonna avrebbe
cancellato dati veri partendo da un ramo mai approvato da nessuno.

Da allora il build non chiama `prisma migrate deploy` direttamente ma
`npm run db:deploy-safe` (`scripts/migrate-safe.ts`):

- **pubblicazione vera** (`VERCEL_ENV=production`) o **in locale**: applica tutto;
- **anteprima**: applica solo se tutte le migrazioni in attesa **aggiungono**. Se
  una porta via dati, non applica niente e lo scrive nel registro del build.
  L'anteprima si costruisce comunque e gira sullo schema attuale: le parti nuove
  possono non funzionare, e va bene — un'anteprima rotta si vede, dei dati
  cancellati no.

Cosa conta come «porta via dati» sta in `src/lib/migration-safety.ts`, con una
prova che esamina **tutte** le migrazioni del repo: quando arriverà la prima
distruttiva legittima (il passo 3 della regola qui sopra) la prova fallirà, e
va dichiarata a mano in `DICHIARATE_DISTRUTTIVE` dentro
`tests/migrazioni-sicure.test.ts`. È attrito voluto: dichiararla significa aver
deciso che quel dato si può perdere.

**La soluzione definitiva** resta un database separato per le anteprime (Neon
sa creare un ramo per ogni richiesta di modifica). Questo è il freno che serve
finché non c'è.

## E se due pubblicazioni si sovrappongono

`prisma migrate deploy` prende una serratura sul database (un *advisory lock*)
e dopo dieci secondi rinuncia. Su Vercel due build si sovrappongono spesso —
l'anteprima di una richiesta e la pubblicazione della stessa fusione — e quella
che arrivava seconda **faceva fallire il build**. È successo due volte in un
giorno: la prima ha messo un segno rosso su una richiesta, la seconda ha fatto
fallire una pubblicazione di produzione con il database perfettamente in
ordine.

Due correzioni, entrambe nello script:

- **se non c'è niente da applicare, `migrate deploy` non viene chiamato.**
  Sembra un dettaglio: anche a vuoto quel comando prende la serratura, e due
  build si bloccavano a vicenda per un lavoro che non c'era;
- **se la serratura è occupata si aspetta il turno** (cinque tentativi, dodici
  secondi). La serratura serve proprio a mettere in fila chi migra, e chi è in
  fila deve attendere. Si riprova **solo** su quell'errore: una migrazione
  scritta male deve fallire subito e forte.

## Le due migrazioni della fedeltà (7 settembre)

`20260907210000_raccolta_punti` aggiunge a `Venue` le due regole della raccolta
punti; `20260907210500_fedelta_valore_e_indici` aggiunge
`LoyaltyTransaction.amountCents` — il valore in centesimi di uno sconto in
punti, fotografato quando si usa — e due indici su `orderId`, per la domanda
«cosa è stato pagato su questo conto?».

Tutte additive: tre colonne che nascono vuote e due indici. Passano il freno
delle anteprime senza eccezioni.
