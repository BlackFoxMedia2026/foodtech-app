#!/usr/bin/env bash
#
# Allinea la vetrina dimostrativa in produzione, con una copia di sicurezza
# prima e una verifica dopo.
#
# Perché serve uno script e non un comando: il seed della demo scrive
# centinaia di righe e riscrive gli stati delle prenotazioni dei **locali
# demo**. È l'operazione giusta da fare — la vetrina che vede chi valuta
# Tavolo vive in produzione — ma va fatta con la possibilità di tornare
# indietro, e "tornare indietro" vuol dire avere il dump di prima.
#
# Uso:
#   DATABASE_URL="<url di produzione>" bash scripts/allinea-demo-produzione.sh
#
# Aggiungi SPOSTA_DATE=1 solo se la demo è invecchiata (le prenotazioni sono
# tutte nel passato): sposta **tutte** le prenotazioni dei locali demo di N
# giorni per riportarle attorno a oggi.
#
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Manca DATABASE_URL. Esempio:"
  echo '  DATABASE_URL="postgresql://…" bash scripts/allinea-demo-produzione.sh'
  exit 1
fi

CARTELLA="${CARTELLA_COPIE:-$HOME/tavolo-copie}"
STAMPO="$(date +%Y%m%d-%H%M%S)"
COPIA="$CARTELLA/produzione-$STAMPO.dump"
mkdir -p "$CARTELLA"

echo "→ 1/5 Copia di sicurezza in $COPIA"
# Formato custom: si ripristina in modo selettivo con pg_restore, tabella per
# tabella, senza dover rifare tutto il database.
pg_dump --format=custom --no-owner --no-privileges --file="$COPIA" "$DATABASE_URL"
DIMENSIONE=$(du -h "$COPIA" | cut -f1)
echo "  copia fatta: $DIMENSIONE"

echo "→ 2/5 Quanti dati ci sono adesso (per confrontare dopo)"
psql "$DATABASE_URL" -At -F' ' -c "
  select 'prenotazioni', count(*) from \"Booking\"
  union all select 'conti chiusi', count(*) from \"Order\" where status = 'COMPLETED'
  union all select 'ospiti', count(*) from \"Guest\"
  union all select 'sondaggi', count(*) from \"Survey\";" 2>/dev/null ||
  echo "  (conteggio non disponibile: alcune tabelle potrebbero avere altri nomi)"

echo "→ 3/5 Migrazioni: applicate?"
# `tail` prendeva l'avviso «aggiorna Prisma» invece della risposta: qui si
# tengono le righe che dicono qualcosa e si scartano la cornice e la pubblicità.
npx prisma migrate status 2>&1 |
  grep -viE "^$|update|prisma@latest|@prisma/client|^[│└┌─]|Environment variables|schema loaded" || true
echo "  Se dice che ci sono migrazioni non applicate, FERMATI: prima"
echo "  npm run db:deploy-safe, poi rilancia questo script."

echo "→ 4/5 Il seed della demo"
if [ "${SPOSTA_DATE:-}" = "1" ]; then
  echo "  con spostamento delle date (SPOSTA_DATE=1)"
  SEED_DEMO_PRODUZIONE=1 SEED_ALLOW_DATE_SHIFT=1 npx tsx prisma/seed.ts
else
  echo "  senza spostare le date: se la demo è invecchiata, rilancia con SPOSTA_DATE=1"
  SEED_DEMO_PRODUZIONE=1 npx tsx prisma/seed.ts
fi

echo "→ 5/5 Com'è adesso"
psql "$DATABASE_URL" -At -F' ' -c "
  select 'prenotazioni', count(*) from \"Booking\"
  union all select 'conti chiusi', count(*) from \"Order\" where status = 'COMPLETED'
  union all select 'ospiti', count(*) from \"Guest\"
  union all select 'sondaggi', count(*) from \"Survey\";" 2>/dev/null || true

cat <<MESSAGGIO

✓ Fatto. Adesso apri https://foodtech-app.vercel.app e controlla la
  Panoramica: l'incasso deve essere un numero misurato, con «N conti chiusi»
  sotto, e non «incassi stimati».

  Se qualcosa non torna, si torna indietro con:
    pg_restore --clean --if-exists --no-owner --no-privileges \\
      --dbname="\$DATABASE_URL" "$COPIA"

  La copia resta in $COPIA — cancellala quando sei sicuro: contiene i dati
  di tutti i locali, non solo quelli demo.
MESSAGGIO
