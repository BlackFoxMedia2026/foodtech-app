# I percorsi end-to-end

I 631 test di Vitest verificano i **moduli**. Questi verificano i **percorsi**:
la catena che va dal cliente che prenota fino al suo nome nel CRM, che è la
cosa per cui il prodotto esiste e che nessun test unitario può dire.

```bash
npm run test:e2e          # tutti i percorsi
npm run test:e2e:ui       # con l'interfaccia di Playwright, per guardarli
npm run db:seed-e2e       # solo i dati di prova (lo fa già il test)
```

La prima volta serve il browser: `npx playwright install chromium`.

## Come sono fatti

- **Dati propri.** `prisma/seed-e2e.ts` crea un'organizzazione e un locale col
  prefisso `e2e-`, separati dalla demo: la demo cambia quando si ritocca la
  vetrina, e un percorso che poggiasse su di essa diventerebbe rosso per una
  modifica commerciale.
- **Servizio sempre aperto.** Il locale di prova ha un turno 00:00–23:59 tutti
  i giorni: le prove riguardano la funzione, non l'ora in cui girano.
- **Un solo accesso.** Il login è limitato a dieci tentativi ogni dieci minuti:
  si entra una volta in `global-setup.ts` e ogni percorso riusa la sessione.
- **Un lavoratore solo, zero ritentativi.** Scrivono sullo stesso database, e
  un percorso che passa al secondo tentativo nasconde una corsa invece di
  mostrarla.

## Quali percorsi ci sono

| File | Cosa percorre |
|---|---|
| `01-dal-sito-al-cliente.spec.ts` | Prenotazione dal widget → conferma in sala → arrivo → tavolo → conto con un piatto → chiusura con i punti accreditati → il cliente nel CRM |
| `02-dalla-coda-al-tavolo.spec.ts` | Aggiunta in lista d'attesa → accomodata a un tavolo → **diventa una prenotazione vera**, non una riga chiusa |
| `03-gift-card-a-meta.spec.ts` | Emissione da 100 € → walk-in → conto → cinque euro scalati → restano dieci da incassare → **95 € sulla carta**, per un'altra volta |
| `04-dal-voto-alla-recensione.spec.ts` | Voto 10 → invito alla recensione → il collegamento passa dalla porta che **conta** il passaggio → il numero compare in Analytics. E, per la strada opposta: voto 4 → si chiede cosa non è andato **in privato**, e nessun invito pubblico |

## Quali mancano, e perché

Dal §80 del master prompt resta **campagna → clic → prenotazione attribuita**:
il meccanismo dell'attribuzione esiste e ha i suoi test, ma il percorso passa
dalla creazione guidata di una campagna, che è la finestra più lunga del
prodotto.

Il quinto del §80 — *prenotazione → caparra → disdetta → rimborso* — **non si
può scrivere**: i pagamenti non esistono ancora (nessuna riga `Payment` viene
creata da nessuna parte). Scriverlo con dati finti darebbe una copertura
inventata, ed è esattamente ciò che questo progetto non fa.

## Le difese pubbliche restano quelle vere

Rilanciando i percorsi, la seconda esecuzione di fila leggeva «Troppe richieste
di seguito»: il limite di frequenza sull'endpoint pubblico funzionava, e la
prova sembrava rotta.

La soluzione **non** è stata allentare i limiti — una prova che gira con difese
diverse da quelle vere non verifica il prodotto vero — ma dichiarare un
indirizzo di provenienza nuovo a ogni esecuzione, che è quello che il
middleware si aspetta da un proxy. Che i limiti funzionino lo verificano i test
unitari (`tests/limite-frequenza.test.ts`).

## Cosa hanno già trovato

Scrivendoli sono emerse tre cose sul prodotto, tutte corrette *nel test* e non
nel codice, perché il codice aveva ragione:

1. una prenotazione dal widget non ha il menu degli stati ma due pulsanti
   espliciti, **Approva** e **Rifiuta** — su quella riga c'è una decisione da
   prendere, non uno stato da correggere;
2. il selettore dei tavoli **propone già** il primo tavolo che basta da solo
   (un tocco in meno durante il servizio): il test lo deselezionava, e adesso
   verifica quel comportamento invece di combatterlo;
3. chiudendo un conto la finestra **non se ne va**: mostra l'esito e i punti
   accreditati, perché quella frase serve a chi deve dirlo al cliente
   («Diglielo»). Il percorso adesso la legge — è il pezzo che unisce il conto
   alla fedeltà — e solo dopo chiude.
