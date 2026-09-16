"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, QrCode, Router } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * L'ultimo passaggio, quello che Tavolo **non** può fare al posto tuo.
 *
 * Il portale è una pagina: perché il cliente ci arrivi da solo appena si
 * attacca alla rete, il router deve mandarcelo. Quella parte vive nel pannello
 * del router, e cambia con la marca — per questo la guida è un cassetto e non
 * un paragrafo in mezzo alla configurazione: chi ha un router che non sa fare
 * la pagina di accesso non deve leggerne tre schermate per scoprirlo.
 *
 * **La seconda strada è dichiarata insieme alla prima**, e non in fondo come
 * ripiego: sui router da locale — quelli che si comprano al supermercato — la
 * pagina di accesso spesso non esiste. Lì il portale funziona lo stesso, con
 * un QR sul tavolo. Nasconderlo vorrebbe dire lasciare qualcuno mezz'ora nel
 * pannello del router a cercare una voce che sul suo apparato non c'è.
 */

type Marca = {
  id: string;
  nome: string;
  /** Dove sta la cosa, detto come lo direbbe chi ce l'ha davanti. */
  passi: string[];
  /** Cosa aspettarsi di trovare, e cosa no. */
  nota?: string;
};

const MARCHE: Marca[] = [
  {
    id: "fritzbox",
    nome: "FRITZ!Box",
    passi: [
      "Apri fritz.box dal browser e accedi con la password dell'apparato.",
      "Vai in Wi-Fi › Rete ospiti e accendi la rete ospiti, se non lo è già.",
      "Attiva la pagina di accesso (login/hotspot) e incolla l'indirizzo del portale.",
      "Salva e prova a collegarti con il telefono alla rete ospiti.",
    ],
    nota:
      "Sui modelli domestici la pagina di accesso mostra solo le condizioni d'uso e non permette un indirizzo esterno: se la voce non c'è, usa il QR.",
  },
  {
    id: "tplink",
    nome: "TP-Link",
    passi: [
      "Entra nel pannello dell'apparato (tplinkwifi.net o l'app Omada/Deco).",
      "Cerca Rete ospiti, oppure Portal / Hotspot nei modelli Omada.",
      "Scegli l'autenticazione con pagina esterna e incolla l'indirizzo del portale.",
      "Salva e prova a collegarti con il telefono alla rete ospiti.",
    ],
    nota:
      "La pagina di accesso esterna c'è sugli apparati Omada; sui router di casa di solito no.",
  },
  {
    id: "ubiquiti",
    nome: "Ubiquiti / UniFi",
    passi: [
      "Apri la console UniFi e vai in Impostazioni › Hotspot (o Guest Hotspot).",
      "Accendi il portale e scegli il portale esterno.",
      "Incolla l'indirizzo del portale e indica la rete ospiti a cui applicarlo.",
      "Salva e prova a collegarti con il telefono alla rete ospiti.",
    ],
  },
  {
    id: "altro",
    nome: "Altro apparato",
    passi: [
      "Nel pannello del router cerca le voci: rete ospiti, hotspot, captive portal, pagina di accesso.",
      "Se c'è la pagina di accesso esterna, incolla lì l'indirizzo del portale.",
      "Se non c'è, il portale funziona lo stesso: si raggiunge con un QR o con il link.",
    ],
    nota:
      "I nomi delle voci cambiano da marca a marca e da una versione all'altra del programma dell'apparato.",
  },
];

export function GuidaRouter({
  portaleUrl,
  className,
  etichetta = "Scopri come collegarlo",
  conLinkQr = true,
}: {
  portaleUrl: string;
  className?: string;
  etichetta?: string;
  /**
   * Il collegamento al costruttore di QR.
   *
   * Si spegne dentro la procedura guidata: lì la configurazione non è ancora
   * salvata, e un link che porta altrove butterebbe via i quattro passi appena
   * fatti. La strada del QR resta scritta, ma si percorre dal pannello.
   */
  conLinkQr?: boolean;
}) {
  const [aperta, setAperta] = useState(false);
  const [marca, setMarca] = useState(MARCHE[0].id);
  const scelta = MARCHE.find((m) => m.id === marca)!;

  return (
    <>
      <Button type="button" variant="outline" size="sm" className={className} onClick={() => setAperta(true)}>
        <Router className="h-3.5 w-3.5" aria-hidden="true" /> {etichetta}
      </Button>

      <Dialog open={aperta} onOpenChange={setAperta}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Collegare il portale al router</DialogTitle>
            <DialogDescription>
              Serve perché la pagina si apra da sola a chi si attacca alla rete ospiti. Senza, il portale
              funziona comunque: ci si arriva con un QR.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Marca dell'apparato">
            {MARCHE.map((m) => (
              <Button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={m.id === marca}
                variant={m.id === marca ? "accent" : "outline"}
                size="sm"
                onClick={() => setMarca(m.id)}
              >
                {m.nome}
              </Button>
            ))}
          </div>

          <div className={cn("riquadro comodo space-y-3")}>
            <ol className="space-y-2.5">
              {scelta.passi.map((passo, i) => (
                <li key={passo} className="flex gap-3 text-sm">
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent/40 text-[11px] font-semibold text-accent-strong"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">{passo}</span>
                </li>
              ))}
            </ol>
            {scelta.nota && <p className="t-nota">{scelta.nota}</p>}
          </div>

          <div className="riquadro comodo space-y-2 bg-card/40">
            <p className="t-etichetta">L&apos;indirizzo da incollare</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all font-mono text-xs">{portaleUrl}</code>
              <CopyButton value={portaleUrl} variant="outline" size="sm" />
            </div>
          </div>

          {/* La seconda strada, e non è un ripiego: su molti apparati è
              l'unica che esiste. */}
          <div className="riquadro comodo space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <QrCode className="h-4 w-4 text-accent-strong" aria-hidden="true" /> Se il tuo router non sa
              farlo
            </p>
            <p className="text-sm text-muted-foreground">
              Stampa un QR del portale e mettilo sui tavoli o al bancone. Chi lo inquadra apre la stessa
              pagina, lascia il contatto e riceve la password: cambia solo come ci arriva.
            </p>
            {/* Il tipo è «personalizzato» con l'indirizzo qui sopra, e non il
                tipo «Wi-Fi»: quello scrive le credenziali dentro al codice e
                collega il telefono senza passare dal portale, cioè senza
                lasciare nessun contatto. Sono due cose diverse con lo stesso
                nome, e vale la pena dirlo prima che qualcuno stampi
                duecento coperti sbagliati. */}
            {conLinkQr ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/marketing/qr-codes/nuovo?tipo=CUSTOM">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Crea il QR del portale
                </Link>
              </Button>
            ) : (
              <p className="t-nota">Si crea dal pannello del portale, appena hai attivato.</p>
            )}
            <p className="t-nota">
              Scegli il tipo <strong>personalizzato</strong> e incolla l&apos;indirizzo qui sopra. Il tipo
              «Wi-Fi» è un&apos;altra cosa: collega il telefono alla rete senza passare dal portale, quindi
              non raccoglie nessun contatto.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
