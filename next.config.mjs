/** @type {import('next').NextConfig} */

/**
 * Intestazioni di sicurezza.
 *
 * Mancavano del tutto, ed erano il punto più in basso di «cosa resta aperto»
 * in `docs/SECURITY.md`. Sono poche righe e valgono per ogni risposta.
 *
 * Cosa **non** c'è, e perché: una `Content-Security-Policy` completa sugli
 * script. Next inserisce script in linea per l'idratazione, quindi una policy
 * vera richiede un nonce generato a ogni richiesta e passato attraverso tutto
 * il rendering. Scriverne una a mano oggi vorrebbe dire o rompere
 * l'applicazione, o metterci `'unsafe-inline'` e chiamare sicurezza una cosa
 * che non protegge da niente. Resta scritto fra le cose aperte.
 *
 * `Strict-Transport-Security` senza `includeSubDomains`: il giorno che il
 * locale attacca un dominio suo, i sottodomini possono servire altro (una
 * casella, un pannello) e imporre HTTPS su cose che non controlliamo è un modo
 * di far sparire un servizio di qualcun altro.
 */
const sicurezza = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none';" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  async headers() {
    return [
      {
        // Tutto tranne le due pagine fatte per stare in un iframe sul sito del
        // ristorante: il widget di prenotazione e il menu pubblico.
        // `X-Frame-Options: DENY` le spegnerebbe in silenzio su ogni sito
        // cliente. Escluderle qui è più sicuro che allentare la regola per
        // tutti.
        //
        // Il portale Wi-Fi resta protetto: è un modulo che raccoglie un
        // contatto, quindi incorniciabile vuol dire ingannabile, e nessun
        // router ha bisogno di metterlo in una cornice — lo apre come pagina.
        source: "/((?!book$|book/|m/).*)",
        headers: sicurezza,
      },
      {
        // Le due pagine pubbliche incorporabili, per progetto. Le altre
        // intestazioni valgono anche per loro: solo quelle sui frame no.
        // Sono pagine di sola lettura o con un modulo che scrive solo una
        // prenotazione, quindi non c'è un'azione privilegiata da rubare con
        // un clic.
        source: "/:percorso(book|m)/:resto*",
        headers: [
          ...sicurezza.filter((h) => h.key !== "X-Frame-Options" && h.key !== "Content-Security-Policy"),
          { key: "Content-Security-Policy", value: "frame-ancestors *;" },
        ],
      },
    ];
  },
};

export default nextConfig;
