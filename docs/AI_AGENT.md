# Agente AI

Stato: **BETA**. Funziona, è ben costruito, e non fa ancora quasi nulla di quello che potrebbe.

## Com'è fatto

```
src/server/ai/
  agent-service.ts      orchestrazione della conversazione
  intent-router.ts      capisce l'intenzione prima di chiamare il modello
  tool-registry.ts      gli strumenti disponibili
  permission-guard.ts   ogni strumento dichiara la capacità che richiede
  usage-service.ts      quota di 200 messaggi al mese per locale
  openai-adapter.ts     l'unico fornitore collegato
  llm-provider.ts       l'interfaccia da cui passare per aggiungerne altri
  action-executors.ts   le azioni che l'agente può eseguire, dopo conferma
  tools/                8 strumenti di dominio
```

Interfaccia: pannello laterale che si apre dalla sfera nell'intestazione
(`src/components/agent/`).

## Gli otto strumenti

`analytics` · `covers` (coperti) · `reservations` (prenotazioni) · `tables` (tavoli) ·
`waiters` (camerieri) · `assign-waiter` (assegna un cameriere a dei tavoli) ·
`contracts` (contratti in scadenza) · `navigation` (porta a una schermata).

Ogni strumento dichiara la capacità che richiede; `requireAbility` la confronta con il ruolo di
chi sta chiedendo. Un cameriere non può farsi raccontare gli incassi passando dall'agente.

## Le due regole che non vanno toccate

**Le azioni non partono da sole.** Quando l'agente propone di fare qualcosa, restituisce un
`action_confirmation` con un riassunto: l'azione parte solo dopo che una persona ha confermato,
da `/api/agent/actions/confirm`. Vale anche quando la richiesta è esplicita.

**Le azioni rispettano permessi e registro.** Passano dalle stesse funzioni di dominio delle
route, quindi dallo stesso controllo di ruolo e dallo stesso `AuditLog`. L'agente non è una
scorciatoia per aggirare i permessi.

## Quota

200 messaggi al mese per locale (`MONTHLY_LLM_LIMIT`), contati su `AgentUsage`. Il pannello
mostra il residuo. Non è ancora legata a un piano commerciale.

## Configurazione

`OPENAI_API_KEY` e `OPENAI_MODEL` (per difetto `gpt-4o-mini`). Senza chiave il pannello si apre
e i suggerimenti si vedono, ma nessuna risposta arriva. **Le due variabili non sono in
`.env.example`.**

Il modello per difetto è il più economico della famiglia: adeguato per instradare intenzioni e
riassumere numeri, meno per i ragionamenti operativi della sezione seguente. Vale una prova
comparata prima di aprire l'agente ai clienti — la scelta è una variabile d'ambiente, non un
cambio di codice.

## Cosa manca per diventare un copilota

Oggi l'agente **risponde**. Il salto è farlo **notare**.

1. **Insight proattivi.** Non aspettare la domanda: «3 cose da sapere oggi» in Panoramica.
2. **Ragionamento operativo.** Non «quanti coperti stasera», ma «fra le 20:00 e le 20:15
   arrivano quattro tavoli e solo due si liberano in tempo». Il motore ha già i dati; serve
   incrociarli.
3. **Memoria del locale.** Preferenze ricorrenti, abitudini, chi è VIP e dove ama sedersi.
4. **Più azioni:** creare e spostare prenotazioni, preparare un segmento, mandare un
   promemoria — sempre con anteprima e conferma.
5. **Un ripiego.** Un solo fornitore senza alternativa: se non risponde, l'agente tace.
