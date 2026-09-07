# Test

```bash
npm test              # tutto
npm run test:watch    # in ascolto sulle modifiche
```

## Due famiglie

**Unità** (`permessi.test.ts`, `fuso-orario.test.ts`, `limite-frequenza.test.ts`,
`registro-azioni.test.ts`) — nessun database, nessuna rete. Verificano le regole pure.

**Integrazione** (`isolamento-locali.test.ts`) — richiedono PostgreSQL e uno schema
allineato (`npm run db:push` o `npm run db:migrate`). Creano i propri dati con il
prefisso `test-iso-` e li cancellano alla fine.

## Sicurezza

I test di integrazione **si rifiutano di partire** se `DATABASE_URL` non contiene
`dev` o `test`: scrivono e cancellano righe, e non devono poter toccare un database
di produzione per una variabile d'ambiente sbagliata.

## Cosa non è coperto

Nessun test end-to-end sul browser: i flussi in interfaccia sono verificati a mano
con gli screenshot in `docs/audit-2026-09/`. Il candidato naturale, quando servirà,
è Playwright — già usato per gli screenshot.
