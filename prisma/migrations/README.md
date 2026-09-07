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
