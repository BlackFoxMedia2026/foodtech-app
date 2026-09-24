"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvvisi } from "@/components/ui/avvisi";
import type { AzioneCliente } from "@/server/integrations/cliente";
import { azione as chiama, ErroreAzione } from "./azioni";

/**
 * **Il pulsante di un'integrazione**, lo stesso sulla scheda del catalogo e
 * sulla pagina. Che cosa dice lo decide il server (`statoPerIlCliente`); qui
 * si decide solo come appare e che cosa succede al clic.
 *
 * «Richiedi attivazione» e «Avvisami» mandano una richiesta **a Foodtech**
 * (`richieste.ts`) e diventano subito il loro stato spento: niente conferma,
 * perché non c'è niente di irreversibile, e chiedere due volte non serve.
 */
export function PulsanteAzione({
  slug,
  nome,
  azione: iniziale,
  hrefNativa,
  puoRichiedere,
  size = "sm",
  inAttivazione = false,
}: {
  slug: string;
  nome: string;
  azione: AzioneCliente;
  hrefNativa: string | null;
  /** Chiedere un'attivazione e collegare è di chi amministra il locale. */
  puoRichiedere: boolean;
  size?: "sm" | "default";
  inAttivazione?: boolean;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [azione, setAzione] = useState(iniziale);
  const [inCorso, setInCorso] = useState(false);
  const pagina = `/settings/integrations/${slug}`;

  async function richiedi(dopo: AzioneCliente, testo: string) {
    setInCorso(true);
    try {
      const r = await chiama<{ giaDisponibile: boolean }>(slug, { azione: "richiedi" });
      if (r.giaDisponibile) {
        router.refresh();
        return;
      }
      setAzione(dopo);
      avvisi.mostra(testo);
      router.refresh();
    } catch (e) {
      avvisi.problema(e instanceof ErroreAzione ? e.message : "Non siamo riusciti a inviare la richiesta. Riprova.");
    } finally {
      setInCorso(false);
    }
  }

  const attesa = inCorso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null;

  switch (azione) {
    case "COLLEGA":
      if (hrefNativa) {
        return (
          <Button asChild variant="accent" size={size}>
            <Link href={hrefNativa}>Collega</Link>
          </Button>
        );
      }
      return puoRichiedere ? (
        <Button asChild variant="accent" size={size}>
          <Link href={`${pagina}?collega=1`}>{size === "default" ? `Collega ${nome}` : "Collega"}</Link>
        </Button>
      ) : null;
    case "RIPRENDI":
      return puoRichiedere ? (
        <Button asChild variant="accent" size={size}>
          <Link href={`${pagina}?collega=1`}>Completa il collegamento</Link>
        </Button>
      ) : null;
    case "GESTISCI":
      return (
        <Button asChild variant="outline" size={size}>
          <Link href={hrefNativa ?? pagina}>Gestisci</Link>
        </Button>
      );
    case "RICHIEDI_ATTIVAZIONE":
      return puoRichiedere ? (
        <Button
          variant="outline"
          size={size}
          disabled={inCorso}
          onClick={() => void richiedi("RICHIESTA_INVIATA", `Richiesta per ${nome} inviata a Foodtech.`)}
        >
          {attesa}
          {inAttivazione ? "Richiedi accesso" : "Richiedi attivazione"}
        </Button>
      ) : null;
    case "RICHIESTA_INVIATA":
      return (
        <Button variant="ghost" size={size} disabled aria-disabled="true">
          <Check className="h-4 w-4" aria-hidden="true" /> Richiesta inviata
        </Button>
      );
    case "AVVISAMI":
      return puoRichiedere ? (
        <Button
          variant="ghost"
          size={size}
          disabled={inCorso}
          onClick={() => void richiedi("AVVISO_ATTIVO", `Ti avviseremo quando ${nome} sarà disponibile.`)}
        >
          {attesa ?? <Bell className="h-4 w-4" aria-hidden="true" />}
          Avvisami
        </Button>
      ) : null;
    case "AVVISO_ATTIVO":
      return (
        <Button variant="ghost" size={size} disabled aria-disabled="true">
          <Check className="h-4 w-4" aria-hidden="true" /> Ti avviseremo
        </Button>
      );
  }
}
