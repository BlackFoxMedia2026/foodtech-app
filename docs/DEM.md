# Il modulo DEM

Newsletter, piani, invio, statistiche e reputazione. Stato al 15 settembre 2026.

**Per accenderlo:** [DEM-CONFIGURAZIONE.md](DEM-CONFIGURAZIONE.md). Questo documento spiega
com'è fatto; quello spiega cosa fare perché funzioni.

Questo documento serve a chi lavora sul codice. La regola che lo attraversa tutto è una sola,
ed è di prodotto prima che tecnica:

> **Per il cliente il servizio è Foodtech.** Non esiste una schermata, un messaggio d'errore o
> una etichetta che nomini l'infrastruttura di invio. Chi compra Foodtech ha comprato Foodtech,
> non un pannello di qualcun altro con un vestito sopra.

Il confine sta in **un file solo**: [`src/server/dem/ses.ts`](../src/server/dem/ses.ts). Tutto
quello che ci sta sopra parla di «dominio di invio», «invii disponibili», «reputazione».

---

## Dove sta, nel prodotto

**Gli strumenti stanno nel menu Marketing in barra** — campagne, automazioni, coupon, gift
card, Wi-Fi, QR — perché si aprono per *fare* qualcosa.

**Le configurazioni stanno in `Impostazioni → Marketing`**: il piano DEM, il dominio di invio e
la reputazione. Un piano si guarda una volta al mese e un dominio si configura una volta sola:
messe in fila con le campagne allungherebbero di tre voci l'elenco che si legge ogni volta.

| Pagina | Percorso |
| --- | --- |
| Il tuo piano DEM | `/settings/marketing/piano` |
| Confronto piani | `/settings/marketing/piano/confronto` |
| Impostazioni invio | `/settings/marketing/invio` |
| Reputazione | `/settings/marketing/reputazione` |
| Piattaforma (Black Fox) | `/admin/dem` |

L'unica cosa del modulo che resta **dentro** il marketing è l'indicatore degli invii
disponibili in cima alle Campagne: sta lì perché serve mentre si prepara una campagna, e al
clic porta al piano.

---

## Le sette parti

| Parte | Dove | Cosa fa |
| --- | --- | --- |
| Piani | `server/dem/piani.ts`, `lib/dem-piani.ts` | Il catalogo, in tabella e non nel codice |
| Abbonamento | `server/dem/abbonamento.ts` | Piano valido, ciclo, sospensione |
| Consumo | `server/dem/consumo.ts`, `lib/dem-quota.ts` | Usati, riservati, storico, soglie |
| Destinatari | `server/dem/destinatari.ts` | Chi riceve davvero, e perché gli altri no |
| Invio | `server/dem/invio.ts` | Un messaggio per destinatario, a lotti |
| Eventi | `server/dem/eventi.ts` | Consegne, aperture, click, rimbalzi |
| Reputazione | `lib/dem-reputazione.ts`, `server/dem/statistiche.ts` | Giudizio e protezioni |

---

## Il conto degli invii

**Un invio è un destinatario.** Una campagna a 200 contatti costa 200, due campagne da 250 ne
costano 500.

Non costano niente: chi non ha email, chi non ha dato il consenso, chi è in lista di
soppressione, e il secondo di due contatti con lo stesso indirizzo. Il conto lo fa
`eleggibili()`, **una volta**, ed è lo stesso che disegna l'anteprima del wizard e che decide
quanto riservare: due aritmetiche della stessa cosa smetterebbero di coincidere proprio nel
momento in cui si preme «invia».

### Le tre colonne

`DemUsagePeriod` ha `monthlyLimit`, `used`, `reserved`. Disponibili = limite − usati −
riservati.

`reserved` è la parte che evita la scena di due schede aperte che programmano due campagne da
ottomila su diecimila disponibili. La riserva è **una `UPDATE ... WHERE` condizionata** e non
un leggi-decidi-scrivi:

```sql
UPDATE "DemUsagePeriod"
   SET reserved = reserved + $n
 WHERE id = $id AND ("monthlyLimit" - used - reserved) >= $n
```

Chi vede zero righe aggiornate ha perso la corsa. È la stessa forma di `claimJob` nella coda.

### Le transizioni

```
programmazione/invio  → riserva n            (tutto o niente)
ogni lotto inviato    → used += k, reserved -= k
destinatario saltato  → reserved -= 1        (non gli abbiamo scritto)
campagna annullata    → reserved -= tutto
campagna fallita      → reserved -= tutto
```

Lo storico **non si cancella** al rinnovo: una riga per ciclo, con dentro il limite di quel
ciclo congelato.

---

## Upgrade e downgrade

- **Si sale:** effetto immediato. Il tetto sale e il consumo **non** si azzera — 17.000/20.000
  diventa 17.000/100.000. Su Stripe la differenza è fatturata subito.
- **Si scende:** effetto dal rinnovo. Il mese in corso è stato pagato al prezzo vecchio e con
  quel prezzo il cliente ha diritto alla quota vecchia fino alla fine. Il nostro
  `scheduledPlanId` lo applica al passaggio di ciclo; su Stripe il prezzo nuovo compare sulla
  fattura successiva (`proration_behavior: "none"`).

Stripe **non** è la verità applicativa: il piano valido, il limite e il ciclo stanno in
`DemSubscription`. Un webhook che tarda non deve poter spegnere il marketing di chi ha pagato.

---

## Il dominio di invio

Un **sottodominio dedicato** per cliente: `news.ristorante.it`, con il Return-Path su
`bounce.news.ristorante.it`.

Perché due nomi e non uno: il Return-Path richiede un record MX, cioè «la posta per questo nome
la riceve questo server». Metterlo sullo stesso nome da cui partono le newsletter significa che
quel nome non potrà mai ricevere posta per nient'altro.

**Non scriviamo record DNS.** Li generiamo, li mostriamo, il cliente li mette, noi
controlliamo. Il DMARC si **legge** e non si sovrascrive: il cliente può avere già altri
servizi che spediscono a suo nome, e cambiarglielo significherebbe fargli rifiutare posta che
oggi arriva.

---

## L'invio

Mai dentro una richiesta HTTP. Il flusso:

```
campagna → fotografia destinatari → verifica quota → riserva → lavoro in coda
        → lotti da 20 → controllo dell'ultimo istante → invio → identificativo messaggio
        → eventi → statistiche → soppressione → reputazione
```

Il **controllo dell'ultimo istante** (`ancoraRaggiungibile`) rifà consenso e soppressione
appena prima di spedire: fra la programmazione di martedì e l'invio di venerdì qualcuno può
essersi disiscritto. Chi non è più raggiungibile viene saltato e **la sua quota torna
indietro**.

Nessuno riceve due volte: la riga del destinatario passa a «in corso» *prima* della chiamata e
a «inviata» dopo. Se il processo muore in mezzo, quella riga resta lì e non viene ripresa — una
email in meno è un danno piccolo, la stessa email due volte a un cliente vero no.

---

## Gli eventi

Arrivano firmati a `/api/webhooks/ses`. Tre controlli, nessuno facoltativo: il certificato
viene dal dominio giusto, la firma corrisponde, l'argomento è il nostro. È un indirizzo
pubblico che mette indirizzi in soppressione e toglie consensi: senza verifica, chiunque
potrebbe far smettere di ricevere le newsletter a un cliente qualsiasi.

**La ripetizione è la regola**, non l'eccezione: lo stesso evento arriva più volte e fuori
ordine. L'idempotenza è il vincolo unico su `CampaignEvent.providerEventId` — non un controllo
«guardo se c'è già», che fra due consegne in parallelo non vede niente.

Le **aperture** sono un fatto tecnico («l'immagine è stata caricata»), non una prova di
lettura: i programmi di posta che proteggono la privacy la caricano da soli, e chi legge con le
immagini spente non risulta mai. L'interfaccia le chiama «Aperture» perché è la parola che
tutti usano, e lo dice.

---

## Rimbalzi, segnalazioni, disiscrizioni

| Evento | Cosa succede |
| --- | --- |
| Rimbalzo **definitivo** | Soppressione dell'indirizzo, per quel locale |
| Rimbalzo **temporaneo** | Si registra e basta: una casella piena un martedì non è un cliente da perdere |
| Segnalazione spam | Soppressione + consenso tolto + riga nel registro consensi |
| Disiscrizione | Consenso tolto, `unsubscribedAt`, soppressione — **la scheda cliente resta** |

La soppressione è **per indirizzo e per locale**: la stessa email può stare su due schede
doppione, e un indirizzo che rimbalza per il Ristorante A non è un problema del Ristorante B.

---

## Reputazione

Soglie in configurazione (`DEM_BOUNCE_*`, `DEM_COMPLAINT_*`) e non nel codice: quelle
dell'infrastruttura cambiano senza preavviso, e inseguirle con una pubblicazione ogni volta
significa trovarsi un giorno con un limite nostro più permissivo del suo.

Sotto i 50 invii non si giudica: un rimbalzo su cinque fa «20%», che ha la forma di un disastro
ed è un indirizzo scritto male.

Oltre la soglia critica gli invii del locale si fermano — **senza cancellare niente** — il
cliente riceve una frase che non nomina nessuna sigla, e la piattaforma lo vede nell'elenco.

---

## Super Admin

`/admin/dem`, dietro `SUPER_ADMIN_EMAILS`. È un elenco nell'ambiente e **non** un ruolo nel
database di proposito: i ruoli del prodotto vivono dentro un locale, questo potere è di un
altro ordine, e non deve poter nascere da una riga scritta. Elenco vuoto = pannello inesistente
per tutti.

I costi dell'infrastruttura stanno **solo** qui, in dollari, e non sono convertiti in euro:
servirebbe un tasso di cambio, e uno inventato produrrebbe un margine che sembra un dato.
Nessuna parte del prodotto li usa per decidere qualcosa.

---

## Due strade di invio

Finché `DEM_SES_ENABLED` non è acceso, o finché il dominio di un locale non è pronto, le
campagne passano dalla vecchia strada (consegna a un fornitore esterno, `campaign.send`). Non è
una scorciatoia rimasta lì: è quello che permette a un locale che non ha ancora configurato il
dominio di mandare comunque le sue email invece di trovarsi il marketing spento.

La scelta si fa **in un punto solo**, in `queueCampaign`.

---

## Cosa manca

- **Migrazione delle sottoscrizioni Stripe** quando si cambia il prezzo di un piano: oggi il
  prezzo nuovo vale dal prossimo acquisto e gli abbonamenti attivi restano al vecchio. È
  voluto — cambiare quanto paga della gente non può essere l'effetto collaterale di un
  salvataggio — ma la procedura esplicita non c'è ancora.
- **Segmenti salvati**: oggi un segmento è un filtro dentro la campagna, non un'entità
  riutilizzabile.
- **Importazione contatti** con deduplica e consenso: la struttura c'è (`eleggibili`,
  `DemSuppression`), la schermata no.
- **Pacchetti extra, sconti, annuale**: il database non li impedisce (`DemPlan.interval`,
  `metadata`, `customMonthlyLimit`), il codice non li implementa.
