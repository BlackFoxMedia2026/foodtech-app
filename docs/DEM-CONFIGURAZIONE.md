# Accendere il modulo DEM

Procedura da fare **una volta**, in quest'ordine. Il codice c'è già ed è inerte: finché questi
passi non sono fatti, le campagne passano dal vecchio fornitore e le schermate lo dicono invece
di rompersi.

L'ordine non è indifferente. Due passaggi dipendono da qualcosa fatto prima, e sono segnalati.

---

## 0. Il database

La migrazione `20260915160000_dem_piani_consumo_invio` è **solo additiva**: nessuna colonna
tolta, nessuna tabella cancellata. In produzione la applica il build (`prisma migrate deploy`).

```bash
npm run db:status      # deve dire che è allineato o elencare solo questa migrazione
```

Se dice che mancano tabelle che esistono già, il database di produzione non è stato
*baselined*: vedi `prisma/migrations/README.md` prima di pubblicare.

---

## 1. Super Admin — **prima di tutto il resto**

Serve per primo perché il pannello è il posto da cui si incollano gli identificativi Stripe del
passo 2.

```bash
SUPER_ADMIN_EMAILS="luca.scamaldo@blackfoxmedia.agency"
```

Più email separate da virgola. **Elenco vuoto = pannello inesistente per tutti**, compreso chi
lo ha scritto. Poi `/admin/dem` risponde; a chiunque altro risponde «non esiste».

---

## 2. Stripe

Si riusa l'integrazione che c'è già: stesse chiavi, stesso webhook. Cambia solo chi incassa —
qui la piattaforma, non il ristorante.

### 2.1 I prezzi

Nel cruscotto Stripe **della piattaforma** (non di un account collegato), creare quattro prezzi
ricorrenti mensili in EUR:

| Piano | Importo |
| --- | --- |
| Start | 19,90 |
| Business | 49,90 |
| Pro | 99,00 |
| Premium | 249,00 |

Il piano **Incluso non ha un prezzo**: non si compra, ed è quello con cui nasce ogni locale.

### 2.2 Incollarli

`/admin/dem/piani` → campo «Identificativo prezzo Stripe» (`price_…`) per ognuno dei quattro.

Senza, il piano non è acquistabile e il pulsante «Passa a…» risponde con un errore parlante.

### 2.3 Il webhook

Sullo stesso endpoint già registrato (`https://<dominio>/api/webhooks/stripe`) **aggiungere**
questi eventi a quelli che ci sono:

```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

> Il `STRIPE_WEBHOOK_SECRET` resta quello: è lo stesso endpoint.

### 2.4 Prova

Comprare un piano su un locale di prova con una carta di test. Il piano deve comparire in
`Impostazioni → Marketing → Piano DEM` **dopo l'evento**, non al ritorno dal pagamento: il redirect del browser
non conferma niente, e la pagina lo dice esplicitamente.

---

## 3. AWS

### 3.1 Prima di toccare le chiavi

Tre cose da guardare nella console, e nessuna si può dare per scontata:

1. **La regione.** Scegliere quella dove si spedisce e **verificare che supporti la gestione
   dei tenant**: senza, `assicuraSpazio()` fallisce alla prima configurazione di un dominio.
2. **L'accesso in produzione.** Un account nuovo è in modalità di prova e scrive solo a
   indirizzi verificati a mano. Va richiesta l'attivazione completa. Finché non c'è, il
   pannello `/admin/dem` lo scrive in cima — ed è quello il posto in cui guardare, perché una
   campagna vera partirebbe, scalerebbe il credito del cliente e verrebbe rifiutata.
3. **Il piano tariffario attivo.** Va letto, non dedotto: serve solo a
   `DEM_COSTO_PER_MILLE_USD`, che è nostro e non c'entra con quanto paga il cliente.

### 3.2 I permessi

Una policy IAM con **esattamente** queste azioni — sono tutte e sole quelle che il codice
chiama:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvioEConfigurazione",
      "Effect": "Allow",
      "Action": [
        "ses:GetAccount",
        "ses:CreateTenant",
        "ses:GetTenant",
        "ses:CreateTenantResourceAssociation",
        "ses:CreateConfigurationSet",
        "ses:CreateConfigurationSetEventDestination",
        "ses:CreateEmailIdentity",
        "ses:GetEmailIdentity",
        "ses:PutEmailIdentityMailFromAttributes",
        "ses:SendEmail"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DiagnosticaSolaLettura",
      "Effect": "Allow",
      "Action": [
        "ses:ListTenants",
        "ses:ListConfigurationSets",
        "ses:GetConfigurationSetEventDestinations"
      ],
      "Resource": "*"
    },
    {
      "Sid": "RiconciliazioneFattura",
      "Effect": "Allow",
      "Action": "ce:GetCostAndUsage",
      "Resource": "*"
    }
  ]
}
```

### Perché ognuna di queste azioni

Il primo blocco è l'invio: sono le dieci che il modulo usa per spedire e per preparare lo
spazio di un cliente. Non ne serve nessun'altra.

Il secondo blocco è **diagnostica in sola lettura**, e serve al pannello «Stato
infrastruttura email»: confrontare i tenant e gli insiemi di configurazione che il nostro
database si aspetta con quelli che esistono davvero su AWS, e verificare che la
destinazione degli eventi sia presente **e accesa**. Senza, il pannello non mente: scrive
«non verificabile» e dice quale permesso manca. Sono letture: nessuna di queste può
cambiare qualcosa.

> **Nota su una lettura che c'era già.** `ses:GetAccount` e `ses:GetTenant` stanno nel
> primo blocco e non nel secondo, anche se sono letture: le usava già il codice di invio
> prima che esistesse la diagnostica — `GetAccount` per sapere se l'account è ancora in
> sandbox prima di accendere il modulo a un cliente, `GetTenant` per non ricreare uno
> spazio che esiste. Spostarle qui sotto avrebbe fatto sembrare che l'invio possa
> funzionare senza, e non è vero.

Il terzo è la riconciliazione con la fattura. `ce:GetCostAndUsage` **non supporta i
permessi per risorsa**: Cost Explorer non ha ARN su cui puntare, quindi `"Resource": "*"`
è l'unica forma possibile — non è una scorciatoia. La lettura si paga 0,01 $ a richiesta e
il codice non la chiama più di due volte al giorno.

**Quello che non c'è, di proposito:** nessun `ses:*`, nessun `ce:*`, nessuna
cancellazione. Un utente che può spedire non deve poter cancellare l'identità di un
cliente, e la diagnostica non ha motivo di poter scrivere niente.

Dove l'infrastruttura lo permette, **un ruolo invece di una coppia di chiavi**: il client non
le passa a mano, quindi basta non impostarle e le trova l'ambiente.

### 3.3 L'argomento per gli esiti

Creare un argomento SNS nella stessa regione.

> **L'ordine conta.** L'endpoint rifiuta i messaggi finché non conosce l'argomento: risponde
> 503 senza `SES_EVENT_SNS_TOPIC_ARN` e 403 se l'argomento non corrisponde. Quindi:
> **prima le variabili e la pubblicazione, poi l'iscrizione.**

1. Impostare le variabili del passo 3.4 e pubblicare.
2. Creare l'iscrizione HTTPS a `https://<dominio>/api/webhooks/ses`.
3. La conferma è automatica: il codice verifica firma e argomento e **poi** conferma. Se
   l'iscrizione resta «in attesa», è uno dei tre controlli che non passa — il motivo è nei log
   come `dem.eventi.firma_non_valida` o `dem.eventi.argomento_estraneo`.
4. Nella policy dell'argomento, permettere a `ses.amazonaws.com` di pubblicare.

### 3.4 Le variabili

```bash
DEM_SES_ENABLED="1"
AWS_REGION="eu-south-1"          # la regione scelta al passo 3.1
AWS_ACCOUNT_ID="123456789012"    # serve a comporre gli ARN: senza, l'associazione allo spazio fallisce
AWS_ACCESS_KEY_ID="..."          # oppure niente, e si usa il ruolo
AWS_SECRET_ACCESS_KEY="..."
SES_EVENT_SNS_TOPIC_ARN="arn:aws:sns:eu-south-1:123456789012:foodtech-dem-eventi"
```

`AWS_ACCOUNT_ID` è quello che si dimentica più facilmente e il cui errore si vede tardi: senza,
gli identificativi delle risorse escono malformati e lo spazio del cliente resta scollegato dal
suo insieme di configurazione — le email partono e gli esiti non tornano.

### 3.5 Le soglie, se si vogliono diverse dai valori per difetto

```bash
DEM_BOUNCE_WARNING="4"
DEM_BOUNCE_CRITICAL="8"
DEM_COMPLAINT_WARNING="0.2"
DEM_COMPLAINT_CRITICAL="0.5"
DEM_TEST_SEND_LIMIT="10"
DEM_COSTO_PER_MILLE_USD="0.10"
```

Sono **nostre**, non di chi spedisce: servono a intervenire prima che intervenga lui.

---

## 4. Il cron

`/api/cron/dem` è già in `vercel.json` (ogni 20 minuti): ricontrolla i domini in attesa e
valuta la reputazione di chi ha inviato negli ultimi sette giorni.

Richiede `CRON_SECRET`, che il progetto già usa per gli altri cinque. Senza, tutti i cron
rispondono 500 e il modulo resta fermo su «in attesa» per sempre.

---

## 5. Per ogni cliente

Da `Impostazioni → Marketing → Dominio di invio`, dentro il locale:

1. **Dominio del locale** — `ristorante.it`. Proponiamo `news.ristorante.it`.
2. **Risposte** — dove le legge davvero qualcuno. La casella da cui si spedisce non la apre
   nessuno.
3. **I record DNS** — tre CNAME per la firma, un MX e un TXT per il Return-Path. Si aggiungono
   dove il cliente tiene il dominio. **Non li scriviamo noi**, e il sito e la posta aziendale
   non vengono toccati: sono nomi nuovi che prima non esistevano.
4. **«Ho configurato i DNS»** — e da lì ci pensa il cron. La propagazione va da qualche minuto
   a qualche ora; quando è pronto arriva una notifica e un'email.
5. **Il DMARC** compare come consiglio se manca. Non lo mettiamo noi: se il cliente ha altri
   servizi che spediscono a suo nome, un DMARC messo senza controllare glieli blocca.

---

## 6. La prova end-to-end

Su un locale vero, con un piano Incluso:

| Passo | Risultato atteso |
| --- | --- |
| Dominio configurato e verificato | la riga «Stato» dice «Pronto per l'invio» |
| Campagna a più di 500 destinatari | Bloccata, con scritto quanti invii mancano |
| Acquisto di Start | Limite 20.000, consumo **non** azzerato |
| Invio della campagna | La quota scende mentre parte, non tutta alla fine |
| Dopo qualche minuto | Consegne e aperture in `/campaigns/<id>` |
| Rimbalzo o segnalazione | L'indirizzo sparisce dalla campagna successiva |
| Un secondo locale | Invia normalmente, indipendente dal primo |

Se le statistiche restano a zero mentre le email arrivano, il problema è **sempre** al passo
3.3: gli esiti non entrano. I log dicono quale dei tre controlli non passa.
