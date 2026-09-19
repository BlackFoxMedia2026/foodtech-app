import { NextResponse, type NextRequest } from "next/server";
import { ERRORE_TROPPI_TENTATIVI } from "@/lib/errori-accesso";
import { RATE_LIMITS, checkRateLimit, clientKey, type RateLimitRule } from "@/lib/rate-limit";

/**
 * Unico punto attraversato da tutte le richieste. Prima non esisteva: il
 * limite di frequenza non aveva un posto dove vivere e ogni route avrebbe
 * dovuto ricordarselo da sola.
 *
 * Qui sta solo ciò che va deciso *prima* di toccare il database: quante
 * richieste accettare. Sessione e permessi restano nelle route, dove serve
 * conoscere il locale attivo e il ruolo (vedi lib/api-auth.ts) — cose che il
 * middleware, che gira sull'edge senza accesso a Prisma, non può sapere.
 */

type Guarded = { rule: RateLimitRule; bucket: string; methods?: string[] };

function ruleFor(req: NextRequest): Guarded | null {
  const { pathname } = req.nextUrl;

  if (pathname === "/api/public/bookings") {
    return { rule: RATE_LIMITS.publicBooking, bucket: "public-booking", methods: ["POST"] };
  }
  // L'ospite conferma o annulla dal link del promemoria: severo come la
  // creazione, perché è l'endpoint da cui si potrebbero provare token a caso.
  // Il sondaggio: severo come le altre azioni pubbliche, perché è l'altro
  // endpoint da cui si potrebbero provare token a caso.
  if (pathname === "/api/public/survey") {
    return { rule: RATE_LIMITS.publicBooking, bucket: "survey", methods: ["POST"] };
  }
  // Accettare un invito: severo come le altre azioni pubbliche, perché è
  // l'endpoint da cui si potrebbero provare segreti a caso per entrare nel
  // team di qualcun altro.
  if (pathname === "/api/public/invite") {
    return { rule: RATE_LIMITS.publicBooking, bucket: "invite", methods: ["POST"] };
  }
  // Reimpostare la password da un link: severo come l'invito, per lo stesso
  // motivo — è un endpoint su cui si potrebbero provare token a caso.
  if (pathname === "/api/public/reimposta-password") {
    return { rule: RATE_LIMITS.publicBooking, bucket: "reimposta-password", methods: ["POST"] };
  }
  // Il pagamento al tavolo. Due limiti diversi perché sono due cose diverse:
  // avviare un pagamento costa una sessione da Stripe, leggere il conto è la
  // richiesta che tiene aggiornato il telefono di chi è ancora a tavola.
  if (pathname.startsWith("/api/public/pay/")) {
    return pathname.endsWith("/avvia")
      ? { rule: RATE_LIMITS.publicPay, bucket: "pay-avvia", methods: ["POST"] }
      : { rule: RATE_LIMITS.publicPayStato, bucket: "pay-stato", methods: ["GET"] };
  }
  if (pathname === "/api/public/booking-action") {
    return { rule: RATE_LIMITS.publicBooking, bucket: "booking-action", methods: ["POST"] };
  }
  // Il portale Wi-Fi scrive nel CRM: severo come la prenotazione pubblica.
  // Generoso quanto basta perché un tavolo di sei persone si colleghi tutto
  // dalla stessa rete, cioè dallo stesso indirizzo.
  if (pathname === "/api/public/wifi") {
    return { rule: RATE_LIMITS.publicWifi, bucket: "public-wifi", methods: ["POST"] };
  }
  if (pathname.startsWith("/api/public/availability")) {
    return { rule: RATE_LIMITS.publicAvailability, bucket: "public-availability" };
  }
  if (pathname === "/api/v1/licenza") {
    /* Accende e spegne il telefono di un locale, e non chiede un token: la
       prova e la firma. Il limite serve proprio per questo — senza, sarebbe il
       posto da cui provare chiavi a caso. Severo come una prenotazione
       pubblica: accendere un locale e un gesto che si fa una volta. */
    return { rule: RATE_LIMITS.publicBooking, bucket: "licenza", methods: ["POST"] };
  }
  if (pathname === "/api/public/riprendi") {
    /* Severo come una prenotazione dal widget, ed e la stessa cosa: scrive una
       prenotazione. Il token la protegge gia da chi passa per caso, ma un
       token rubato non deve poter scrivere trecento prenotazioni. */
    return { rule: RATE_LIMITS.publicBooking, bucket: "riprendi", methods: ["POST"] };
  }
  if (pathname === "/api/public/recupero-password") {
    return { rule: RATE_LIMITS.recupero, bucket: "recupero", methods: ["POST"] };
  }
  // Il login di NextAuth: /api/auth/callback/credentials
  if (pathname.startsWith("/api/auth/callback")) {
    return { rule: RATE_LIMITS.login, bucket: "login", methods: ["POST"] };
  }
  if (pathname.startsWith("/api/agent/")) {
    return { rule: RATE_LIMITS.agent, bucket: "agent", methods: ["POST"] };
  }
  if (
    pathname.endsWith("/upload-image") ||
    pathname.endsWith("/photo") ||
    pathname.endsWith("/document") ||
    pathname.endsWith("/documents") ||
    pathname.endsWith("/attestato") ||
    pathname.endsWith("/certificato")
  ) {
    return { rule: RATE_LIMITS.upload, bucket: "upload", methods: ["POST", "PUT"] };
  }

  return null;
}

export function middleware(req: NextRequest) {
  const guarded = ruleFor(req);
  if (!guarded) return NextResponse.next();
  if (guarded.methods && !guarded.methods.includes(req.method)) return NextResponse.next();

  const verdict = checkRateLimit(`${guarded.bucket}:${clientKey(req.headers)}`, guarded.rule);

  if (!verdict.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Troppe richieste di seguito. Riprova fra qualche istante.",
        /*
          Solo per il login, e serve a farsi capire da NextAuth.

          `signIn()` legge `url` dalla risposta del proprio callback e ci cerca
          dentro il parametro `error`. Senza quel campo costruisce
          `new URL(undefined)` e **solleva**: la schermata d'accesso resta su
          «Accesso in corso…» per sempre, senza messaggio e senza pulsante. Con
          questo, il 429 arriva alla pagina come un esito da scrivere — vedi
          `lib/errori-accesso.ts`.
        */
        ...(guarded.bucket === "login" && {
          url: new URL(`/api/auth/error?error=${ERRORE_TROPPI_TENTATIVI}`, req.url).toString(),
        }),
      },
      {
        status: 429,
        headers: {
          "retry-after": String(verdict.retryAfterSeconds),
          "x-ratelimit-limit": String(guarded.rule.limit),
          "x-ratelimit-remaining": "0",
        },
      },
    );
  }

  const res = NextResponse.next();
  res.headers.set("x-ratelimit-limit", String(guarded.rule.limit));
  res.headers.set("x-ratelimit-remaining", String(verdict.remaining));
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
