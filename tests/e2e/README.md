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

## Quali mancano, e perché

Dal §80 del master prompt restano quattro percorsi:

- **lista d'attesa → offerta → prenotazione**;
- **gift card: emissione → uso parziale → residuo**;
- **campagna → clic → prenotazione attribuita**;
- **sondaggio → promotore → clic sulla recensione contato**.

Il quinto del §80 — *prenotazione → caparra → disdetta → rimborso* — **non si
può scrivere**: i pagamenti non esistono ancora (nessuna riga `Payment` viene
creata da nessuna parte). Scriverlo con dati finti darebbe una copertura
inventata, ed è esattamente ciò che questo progetto non fa.

## Cosa ha già trovato

Scrivendo il primo percorso sono emerse due cose sul prodotto, entrambe
corrette *nel test* e non nel codice, perché il codice aveva ragione:

1. una prenotazione dal widget non ha il menu degli stati ma due pulsanti
   espliciti, **Approva** e **Rifiuta** — su quella riga c'è una decisione da
   prendere, non uno stato da correggere;
2. il selettore dei tavoli **propone già** il primo tavolo che basta da solo
   (un tocco in meno durante il servizio): il test lo deselezionava, e adesso
   verifica quel comportamento invece di combatterlo.
