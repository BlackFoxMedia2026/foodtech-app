# Come si scopre che qualcosa è rotto

**Stato all'8 settembre 2026.**

Fino a stamattina la risposta era: **da un cliente**. Un'automazione che
esplodeva in produzione finiva in un `console.error` senza contesto, e i cinque
lavori pianificati non avevano un `try`: se uno fallliva, Vercel registrava un
500 e nessuno sapeva quale dei cinque fosse né da quanto tempo succedeva.

Questo documento dice cosa c'è ora, cosa cercare, e cosa manca.

## Una riga JSON per fatto

Tutto passa da `src/lib/observability.ts`, e ogni riga ha la stessa forma:

```json
{"ts":"2026-09-08T07:12:55.102Z","livello":"info","evento":"cron.survey-requests","cron":"survey-requests","esito":"ok","durataMs":21}
```

Il campo che conta è **`evento`**, ed è scelto perché si possa cercare. Su
Vercel: `vercel logs <url> --json | jq 'select(.evento)'`, oppure la ricerca
del pannello per il nome dell'evento.

| Evento | Livello | Cosa vuol dire |
|---|---|---|
| `cron.<nome>` | info | un lavoro pianificato è finito: `esito` e `durataMs` |
| `cron.<nome>.non_riuscito` | errore | è esploso. Il messaggio e sei righe di traccia sono nella riga |
| `cron.non_configurato` | attenzione | manca `CRON_SECRET`: il lavoro **non parte**, e si risolve nelle variabili d'ambiente |
| `cron.non_autorizzato` | attenzione | qualcuno ha chiamato un cron senza il segreto. Rumore, o qualcuno che prova |
| `coda.lavoro_riprovato` | attenzione | un tentativo è andato male e riparte: è normale |
| `coda.lavoro_arreso` | errore | un lavoro ha esaurito i tentativi. Questo va guardato |
| `coda.ripresi_dopo_interruzione` | attenzione | lavori rimasti appesi e rimessi in coda. Uno o due capitano; molti, sempre, vogliono dire che qualcosa si blocca nello stesso punto |
| `api.errore_non_gestito` | errore | l'unico errore che non sappiamo spiegare. Il percorso della richiesta lo associa Vercel |

## Cosa non finisce nei log, mai

Email, telefoni, nomi, indirizzi, segreti, token, codici gift card.

Un log è il posto **meno protetto** in cui un dato personale può finire, e ci
resta per mesi. Quando serve sapere di chi si parla si scrive
l'identificativo — che senza il database non dice niente a nessuno — oppure
l'indirizzo mascherato con `mascheraEmail()`, che dà `m***i@ristorante.it`:
riconoscibile da chi ha il database, inutile a chiunque altro.

È una regola, non un'abitudine: `logEvento` accetta solo campi dichiarati uno
per uno, così mettere un oggetto intero «per comodità» richiede di scriverlo, e
scriverlo è il momento in cui si nota.

## Come si prova che funziona

Dodici test in `tests/osservabilita.test.ts`, e il più importante è quello che
verifica **cosa non esce**: quando un cron esplode, chi chiama riceve
`{"error":"cron_failed"}` e non una parola del guasto, mentre nei log c'è il
messaggio intero con un nome cercabile.

## Cosa manca ancora

1. **Un fornitore di error tracking** (Sentry o simile). Serve una scelta e un
   account: questo modulo è fatto per diventare il posto unico da cui
   inoltrare, quindi le chiamate sparse per il codice non si toccheranno.
2. **Un allarme.** Oggi i log si guardano; nessuno avvisa. Il primo allarme
   utile è su `coda.lavoro_arreso` e `cron.*.non_riuscito`, ed è quello che
   trasforma «lo scopriamo da un cliente» in «lo sappiamo prima».
3. **Gli errori del browser.** Una schermata che si rompe nel telefono di un
   cameriere non lascia traccia da nessuna parte.
4. **La latenza delle pagine.** `durataMs` c'è sui lavori pianificati, non
   sulle richieste.
