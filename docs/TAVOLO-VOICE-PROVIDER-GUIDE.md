# Tavolo Voice — aggiungere un fornitore di telefonia

Scritto il 18 settembre 2026, con la fase 2.

Questo documento serve a una cosa: **collegare un operatore telefonico nuovo
senza toccare Voice.** Se per farlo bisogna modificare qualcosa fuori da
`src/server/voice/`, l'astrazione ha un buco e va segnalato.

---

## 1. La regola che viene prima di tutte

**Quello che il fornitore non sa fare non compare.**

Non compare spento, non compare con un cartello «in arrivo», non compare con un
messaggio d'errore quando lo si preme: non c'è.

Un pulsante «Trasferisci» che non trasferisce è peggio della sua assenza,
perché chi ha una persona in linea lo preme e resta lì ad aspettare. E
un'interfaccia che mostra dodici comandi di cui tre funzionano insegna a non
fidarsi di nessuno dei dodici.

Per questo ogni capacità parte da **no** (`NESSUNA_CAPACITA` in
`src/lib/voice-capacita.ts`) e va dichiarata una per una. Un fornitore nuovo
che eredita un elenco di sì produce pulsanti rotti, e il difetto si scopre con
un cliente al telefono.

---

## 2. I tre file

| File | Cosa contiene |
|---|---|
| `src/lib/voice-capacita.ts` | il tipo delle capacità e i loro nomi. In `lib` perché **lo legge anche l'interfaccia**: da un modulo `"use client"` il server non può leggere un valore esportato |
| `src/server/voice/provider.ts` | l'interfaccia `VoiceProvider`, i fornitori, il registro, il guardiano |
| `src/app/api/v1/telefonia/*` | le rotte da cui entrano gli eventi |

---

## 3. Le dieci capacità

```ts
type CapacitaVoice = {
  entranti: boolean;       // riceve le chiamate — senza questa Voice non serve
  uscenti: boolean;        // può chiamare lui (il pulsante «Richiama»)
  browser: boolean;        // si risponde dal browser (WebRTC)
  trasferimento: boolean;
  attesa: boolean;
  toni: boolean;           // manda i toni, per i risponditori altrui
  registrazione: boolean;
  trascrizione: boolean;
  segreteria: boolean;
  ai: boolean;             // sa far rispondere una macchina
};
```

Il **muto** non è fra queste di proposito: si spegne il microfono nel browser, e
non serve niente dal fornitore.

---

## 4. Cosa sa fare Black Fox Voice, oggi

| Capacità | | Perché |
|---|---|---|
| entranti | **sì** | è il ponte: manda squilla/risposta/fine a `/api/v1/telefonia/chiamata` |
| browser | **sì** | con le credenziali SIP del locale, in Impostazioni → Telefono |
| uscenti | no | il centralino non espone niente a Tavolo per chiamare |
| trasferimento, attesa, toni | no | **Asterisk saprebbe farlo**, ma non c'è nessuna rotta per chiederglielo |
| registrazione, trascrizione | no | non configurate |
| segreteria | no | — |
| ai | no | il risponditore a tasti esiste, ma non è una voce che parla |

Il giorno in cui il centralino espone il trasferimento: si cambia **una riga**
in `fornitoreBlackFox.capacita` e il pulsante compare. È il punto di tutto
questo.

---

## 5. Aggiungere un fornitore

```ts
export const fornitoreEsempio: VoiceProvider = {
  nome: "esempio",              // come sta nel database e nei registri
  etichetta: "Esempio Telecom", // come si legge in una schermata

  capacita: {
    ...NESSUNA_CAPACITA,        // sempre da qui
    entranti: true,
    registrazione: true,
  },

  // Solo se il fornitore firma davvero. Assente su chi si autentica altrimenti:
  // obbligare tutti a restituire `true` trasformerebbe un controllo in una
  // formalità, e la formalità è il posto dove passano le cose.
  verificaFirma(intestazioni, corpo) {
    return firmaValida(intestazioni.get("x-signature"), corpo);
  },

  // Traduce il formato del fornitore nel nostro. Restituisce `null` su
  // qualunque cosa non sia un evento: è meglio ignorare un evento che
  // inventare un valore per un campo che non è arrivato.
  leggiEvento(corpo) { /* … */ },

  // Solo i metodi corrispondenti alle capacità vere. Un metodo presente che
  // solleva «non supportato» invita a chiamarlo: meglio che non esista.
  registrazione(venueId, idEsterno) { /* … */ },
};
```

Poi una riga nel registro `FORNITORI` e una `VoiceNumber` con quel `fornitore`.

`fornitoreDi(venueId)` ricava il fornitore dalle linee censite. Quando un
locale non ne ha nessuna — il caso di tutti oggi — si assume Black Fox: è
l'unico che esiste, e restituire `null` obbligherebbe ogni schermata a
distinguere «non ho linee censite» da «non ho un fornitore», che per il
ristoratore sono la stessa cosa.

---

## 6. Come entrano gli eventi

```
il fornitore
   │  POST /api/v1/telefonia/chiamata
   │  Authorization: Bearer tvl_…          ← il token del locale
   ▼
requireApiToken("telefonia:write")         ← chi manda, e per quale locale
   ▼
richiediFunzioneCentralino("riconoscimento")  ← quel locale l'ha comprato?
   ▼
registraEventoChiamata()                   ← upsert su (venueId, externalId)
   ▼
PhoneCall  +  PhoneCallEvent
   ▼
la sonda del servizio (5 s) → lo schermo di chi è in sala
```

**L'idempotenza è nel database**, non in un controllo: unico su
`(venueId, externalId)`. Due consegne dello stesso evento — che su una rete
succede — non possono diventare due chiamate, e la seconda lo scopre dal
vincolo invece che da un controllo che due richieste in parallelo si
scambierebbero senza vedersi.

**L'autenticazione è il token, non la firma.** Il token dice **chi** manda e
**per quale locale**: è più forte di una firma, che dice solo «è arrivato da
là». `verificaFirma` c'è per i fornitori che parlano un formato loro.

---

## 7. Il guardiano, sul server

```ts
const f = await fornitoreDi(venueId);
richiediCapacita(f, "trasferimento");   // solleva CapacitaMancanteError
await f.trasferisci!(venueId, id, a);
```

Serve **sul server** e non solo nell'interfaccia: nascondere un pulsante non
impedisce a nessuno di chiamare l'indirizzo. È la stessa ragione per cui i
permessi si controllano due volte.

---

## 8. Sviluppare senza una linea telefonica

`fornitoreFinto({ trasferimento: true })` restituisce un fornitore con le
capacità che si scelgono. Serve: senza poterle cambiare, la regola «quello che
non si sa fare non compare» si potrebbe provare solo nel ramo «non compare».

E `POST /api/dev/voice/simula` fa squillare il telefono per davvero — scrive una
chiamata vera nella tabella vera, che percorre la stessa strada di una del
centralino. Cambia soltanto chi l'ha annunciata.

Scenari: `OSPITE_NOTO` (prende un ospite vero del locale col suo numero, o
rifiuta: una prova con un numero inventato non verifica il riconoscimento),
`SCONOSCIUTO`, `PERSA` (mette in scena la sequenza intera — squilla, poi
nessuno risponde), `IN_CORSO`.

**In produzione risponde 404.** Il controllo è `process.env.NODE_ENV !==
"production"` **nel codice**, non una variabile d'ambiente: una variabile la si
accende per provare una cosa e la si dimentica accesa, e allora esiste un
indirizzo che inventa telefonate nello storico di un cliente vero.

---

## 9. Quando qualcosa non arriva

Un invio non riuscito **non ferma la chiamata**: il telefono squilla comunque e
resta scritto cosa non è arrivato. Dalla parte del centralino
(`blackfox-voice`) c'è un tetto di 2,5 secondi per evento; la prenotazione del
risponditore invece si ritenta tre volte, perché non consegnarla è un tavolo
perso — ed è sicuro ritentare **solo** perché l'idempotenza qui usa la chiave
del centralino.

Lo stato dell'ultimo invio e l'ultimo errore si leggono nel pannello di
miocentralino, in **Gestionali**: «non mi arrivano le chiamate» si risolve
leggendo quella riga, non aprendo i registri del server.
