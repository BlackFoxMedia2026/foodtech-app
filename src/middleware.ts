import { NextResponse, type NextRequest } from "next/server";
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
  if (pathname === "/api/public/booking-action") {
    return { rule: RATE_LIMITS.publicBooking, bucket: "booking-action", methods: ["POST"] };
  }
  if (pathname.startsWith("/api/public/availability")) {
    return { rule: RATE_LIMITS.publicAvailability, bucket: "public-availability" };
  }
  // Il login di NextAuth: /api/auth/callback/credentials
  if (pathname.startsWith("/api/auth/callback")) {
    return { rule: RATE_LIMITS.login, bucket: "login", methods: ["POST"] };
  }
  if (pathname.startsWith("/api/agent/")) {
    return { rule: RATE_LIMITS.agent, bucket: "agent", methods: ["POST"] };
  }
  if (pathname.endsWith("/upload-image") || pathname.endsWith("/photo") || pathname.endsWith("/document")) {
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
