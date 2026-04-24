# Tavolo · gestionale ospitalità

## 🚀 Prova online in 2 minuti

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/BlackFoxMedia2026/foodtech&project-name=tavolo&repository-name=tavolo&env=NEXTAUTH_SECRET&envDescription=Stringa%20casuale%20per%20firmare%20le%20sessioni%20(qualsiasi%20testo%20lungo%20va%20bene)&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D)

Clicca il pulsante sopra, Vercel crea automaticamente il database, avvia
l'app e carica i dati demo. Login: `owner@tavolo.demo` / `tavolo2026`.

---

Tavolo è un MVP di webapp SaaS per ristoranti, locali, beach club e gruppi
hospitality. Riunisce in un'unica interfaccia la gestione di prenotazioni, sala,
CRM, esperienze, marketing e analytics.

> Questo progetto è **originale**. Non riusa codice, asset, naming o UI di
> prodotti commerciali esistenti — solo i concetti funzionali del segmento.

## Stack

- **Next.js 14** (App Router, RSC) + **TypeScript**
- **Tailwind CSS** + primitive Radix UI in stile shadcn (palette carbone/oro/sabbia)
- **PostgreSQL** + **Prisma** (schema multi-tenant)
- **NextAuth** con provider Credentials (estensibile a magic link, OAuth)
- **Recharts** per analytics
- **Stripe** e **Resend** integrabili (chiavi opzionali)

## Architettura multi-tenant

```
Organization (gruppo hospitality)
└── Venue (singolo locale)
    ├── Room + Table (mappa sala)
    ├── Shift (turni con capienza)
    ├── Guest (CRM)
    ├── Booking (prenotazione)
    ├── Experience + Ticket
    ├── Campaign (marketing)
    └── Payment
```

L'utente accede a uno o più `Venue` tramite `VenueMembership` (ruoli operativi:
`MANAGER`, `RECEPTION`, `WAITER`, `MARKETING`, `READ_ONLY`). Tutte le query e
le API sono scopate per `venueId` tramite `lib/tenant.ts → getActiveVenue()`.
Il locale attivo è memorizzato in cookie e cambiabile dal selector in topbar.

## Struttura cartelle

```
src/
├── app/
│   ├── (marketing)/        # landing pubblica
│   ├── (auth)/sign-in
│   ├── (app)/              # shell autenticata
│   │   ├── overview/       # dashboard
│   │   ├── bookings/       # CRUD prenotazioni
│   │   ├── floor/          # editor sala
│   │   ├── guests/         # CRM
│   │   ├── experiences/
│   │   ├── campaigns/
│   │   ├── payments/
│   │   ├── insights/
│   │   └── settings/
│   └── api/                # route handlers
├── components/
│   ├── ui/                 # primitive (button, card, dialog, …)
│   ├── shell/              # sidebar, topbar, venue switcher
│   ├── overview/, bookings/, floor/, guests/, insights/
├── lib/                    # auth, db, tenant, utils
├── server/                 # service layer (bookings, guests, insights, …)
└── styles/globals.css
prisma/
├── schema.prisma
└── seed.ts
```

## Setup locale

> ⚠️ Punta sempre a un **database vuoto e dedicato**. Lo script di seed crea
> dati di esempio e cancella il proprio nodo demo se rieseguito; non tocca altro.

```bash
# 1. Dipendenze
npm install

# 2. Database (esempio Docker)
docker run --name tavolo-pg -e POSTGRES_USER=tavolo -e POSTGRES_PASSWORD=tavolo \
  -e POSTGRES_DB=tavolo_dev -p 5432:5432 -d postgres:16

# 3. Variabili
cp .env.example .env.local
# imposta DATABASE_URL e NEXTAUTH_SECRET

# 4. Schema + dati demo
npm run db:push
npm run db:seed

# 5. Dev server
npm run dev
```

Accedi a http://localhost:3000 con `owner@tavolo.demo` / `tavolo2026`.

## Funzionalità incluse nell'MVP

| Modulo            | Stato | Note |
| ----------------- | :---: | ---- |
| Dashboard         | ✅    | Coperti, no-show stimati, incassi, trend 7gg, alert |
| Prenotazioni      | ✅    | CRUD, filtri data, cambio stato inline, dettaglio |
| Mappa sala        | ✅    | Editor drag&drop, salvataggio posizioni, blocchi |
| CRM ospiti        | ✅    | Lista, ricerca, scheda con storico e fedeltà |
| Esperienze        | ✅    | Visualizzazione e capienza (creazione UI base) |
| Campagne          | ✅    | Vista performance email/SMS/WhatsApp |
| Pagamenti         | ✅    | Lista movimenti, totali, integrazione Stripe pronta |
| Analytics         | ✅    | Tasso completamento, no-show, fasce orarie, fonti |
| Multi-locale      | ✅    | Switcher in topbar, scoping totale per venue |
| Ruoli RBAC        | ✅    | Matrice in `lib/tenant.ts:can()` |

## Estensioni naturali (non MVP)

- Slot booking pubblico via widget embeddable
- Comunicazioni transazionali (Resend) e WhatsApp Business (Twilio)
- Webhook Stripe per caparre/preautorizzazioni
- Editor sala più avanzato (snap-to-grid, multiselect, rotazione)
- Permessi granulari per campo (es. `privateNotes` solo MANAGER)
- App tablet receptionist con vista "ora"

## Comandi utili

```bash
npm run dev          # Next dev server
npm run typecheck    # tsc
npm run lint         # ESLint
npm run db:studio    # Prisma Studio
npm run db:seed      # Re-seed demo (idempotente sull'org "casa-aurora")
```

## Palette di design

| Token | HEX | Uso |
| ----- | --- | --- |
| `carbon-800` | `#15161a` | Sfondi scuri, navigation attiva |
| `sand-50` | `#fcf9f1` | Sfondo principale chiaro |
| `gilt` | `#c9a25a` | Accenti, CTA premium |
| `gilt-dark` | `#8c6b2e` | Testo accento su chiaro |

Font: **Inter** (UI) + **Fraunces** (display).

## Licenza

Proprietario del progetto. Codice generato ex-novo per lo scenario descritto.
