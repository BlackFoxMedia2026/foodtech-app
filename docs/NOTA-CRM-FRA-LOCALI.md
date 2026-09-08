# Il cliente fra più locali — nota per una decisione

**Data:** 8 settembre 2026 · **Stato:** non implementato, in attesa di una scelta

Questa non è una proposta da approvare così com'è: è il quadro completo di una
decisione che tocca lo schema, la privacy e il modo in cui Tavolo si vende alle
catene. La scrivo perché è l'ultima voce **P1** del Product Gap Audit che non
dipende da un fornitore esterno, ed è anche quella che non va fatta di notte
senza che nessuno l'abbia scelta.

---

## Il problema, detto come lo dice un cliente

Casa Aurora Hospitality ha due locali: Aurora Bistrot a Milano e Riva Beach Club
a Forte dei Marmi. La stessa persona cena in entrambi. Oggi in Tavolo sono **due
clienti diversi**: due schede, due storie, due saldi punti, due gift card che non
si parlano. Chi arriva al Riva con la carta punti di Aurora si sente dire che non
esiste.

CoverManager lo vende come *«One CRM, every guest»* — ed è la frase che chiude la
trattativa con una catena `[COMPETITOR SOURCE]`.

## Perché oggi è così

`Guest` ha `venueId`, non `orgId`. Non è una dimenticanza, è una scelta che nel
mondo dei ristoranti indipendenti è quella giusta: **le allergie, le note
riservate e il consenso al marketing sono di quel locale**, e un ristoratore che
scopre che il locale accanto legge le sue note private smette di scriverle.

Ed è la stessa ragione per cui la soluzione non è «cambiare `venueId` in
`orgId`»: significherebbe rendere condiviso anche quello che non deve esserlo.

## Le tre strade

### A. Guest a livello di organizzazione (una tabella, un cliente)

Si sposta `Guest` sotto `orgId` e i dati per locale (note riservate, tag,
consenso) diventano una tabella figlia `GuestVenueProfile`.

- **Pro:** un solo cliente, punti e gift card naturalmente condivisi, deduplica
  possibile una volta sola.
- **Contro:** è la migrazione più invasiva del progetto. `Guest.venueId` è
  referenziato da tredici tabelle e da tutto il codice che filtra per locale
  (175 occorrenze di `venueId` nello schema). Ogni query del CRM va riscritta, e
  l'isolamento fra locali — che oggi è garantito da un `where` — diventa una
  regola da ricordare a mano. **Sforzo: L.** Rischio: alto.

### B. Un collegamento fra schede (`GuestIdentity`)

Le schede restano per locale; si aggiunge una tabella che dice «queste due
schede sono la stessa persona», scritta quando email o telefono combaciano
**dentro la stessa organizzazione**.

- **Pro:** nessuna riscrittura del CRM, l'isolamento resta com'è, si può
  accendere per organizzazione. La scheda cliente può mostrare una riga in più:
  «è cliente anche del Riva Beach Club — 4 visite là».
- **Contro:** i punti restano per locale (vedi sotto), e la deduplica va tenuta
  aggiornata. **Sforzo: M.** Rischio: basso.

### C. Solo i punti e le gift card

Si lascia il CRM per locale e si rendono spendibili altrove **solo** il saldo
punti e le gift card, con una regola dichiarata («le gift card di Casa Aurora
valgono in entrambi i locali»).

- **Pro:** è la parte che il cliente *vede* e che gli fa sentire la catena come
  una cosa sola. Non tocca note, allergie, consensi.
- **Contro:** non è «One CRM»: nella trattativa con una catena resta un mezzo sì.
  **Sforzo: M** (il valore di un punto è per locale: serve una regola su chi paga
  il conto quando si spende altrove — è contabilità fra locali, non software).

## Quello che va deciso prima del codice, e non è tecnico

1. **Il consenso al marketing si condivide?** Secondo me no: chi ha detto sì al
   Bistrot non ha detto sì al Beach Club, e trattarlo come un unico sì è
   esattamente il tipo di scorciatoia che fa arrivare una segnalazione al
   Garante. Il consenso resta per locale in tutte e tre le strade.
2. **Le note riservate si condividono?** Anche qui no. «Cliente difficile,
   lamentoso» scritto a Milano non deve comparire a Forte dei Marmi.
3. **Chi paga il punto speso altrove?** È una scrittura fra due locali della
   stessa organizzazione. Se la risposta è «nessuno, è la stessa cassa», la
   strada C è semplice; se i locali hanno bilanci separati, serve un movimento
   fra loro e il costo del lavoro raddoppia.
4. **Le allergie si condividono?** Qui direi **sì**, ed è l'unico dato per cui
   la condivisione protegge il cliente invece di servire al locale. Vale la pena
   trattarlo a parte dagli altri.

## Cosa consiglierei, se dovessi scegliere io

**B più il punto 4, e poi C se le catene lo chiedono davvero.**

Il collegamento fra schede dà il 70% del valore percepito («ti riconosco, sei
cliente anche dell'altro locale») al 20% del rischio, e non chiude nessuna
porta: la strada A resta possibile dopo, mentre il contrario non è vero — una
volta che le schede sono fuse, separarle di nuovo è impossibile.

E fa emergere il dato che nessuno ha ancora: **quanti clienti sono davvero in
comune fra due locali della stessa organizzazione.** Se sono venti su duemila,
la strada A non si fa e la discussione finisce con un numero invece che con
un'impressione.

## Come si misura prima di decidere

Una lettura sola, senza toccare niente:

```sql
-- Quante persone hanno la stessa email in due locali della stessa organizzazione
SELECT COUNT(*) FROM (
  SELECT g.email
  FROM "Guest" g JOIN "Venue" v ON v.id = g."venueId"
  WHERE g.email IS NOT NULL AND g."anonymizedAt" IS NULL
  GROUP BY v."orgId", g.email
  HAVING COUNT(DISTINCT g."venueId") > 1
) x;
```

Se il numero è alto, questa nota diventa un progetto. Se è basso, resta una nota
— e va bene così.

**Misurato sulla demo l'8 settembre:** `0` clienti in comune su 121 con email.
Sulla demo non vuol dire niente — i due locali hanno clienti generati separati —
ma la stessa riga girata su un'organizzazione vera è la risposta che serve prima
di aprire il cantiere.
