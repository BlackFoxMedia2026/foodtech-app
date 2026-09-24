"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PARTI, indirizzoParte, parteDa } from "@/lib/parti-impostazioni";
import { classiVoceIn, type NavItem } from "@/components/shell/nav-items";
import { ContenutoVoce } from "@/components/shell/contenuto-voce";
import { CopiaDaMisurare, IndicatoreFila, MenuAltro } from "@/components/shell/fila-principale";
import { useFilaAdattiva } from "@/components/shell/use-fila-adattiva";
import { cn } from "@/lib/utils";
import { SEGNI } from "./segni-impostazioni";

/**
 * Entrare nelle Impostazioni è **un cambio di area**, non una pagina in più.
 *
 * Al posto delle otto voci del gestionale compaiono le cinque sezioni, nello
 * stesso contenitore, con la stessa pillola che scorre. La barra è una sola,
 * sempre, e cambia quello che contiene: è il modo in cui si dice «adesso sei
 * altrove» senza scriverlo da nessuna parte.
 *
 * A sinistra la via d'uscita. Senza, l'unica strada per tornare al gestionale
 * sarebbe il menu del profilo — cioè la stessa porta da cui si è entrati, che
 * nessuno ricorda.
 *
 * ## Sono link, e non lo erano
 *
 * Fino al 18 settembre queste voci **scorrevano** la pagina: le cinque sezioni
 * stavano tutte lì, un contesto le teneva insieme, e un `IntersectionObserver`
 * accendeva quella che passava sotto la testata. Adesso l'indirizzo dice quale
 * sezione è aperta, e una voce in barra è quello che sembra: un link.
 *
 * Nessuna voce accesa sull'**indice**: là non si sta in nessuna sezione, e
 * accenderne una direbbe il falso.
 *
 * ## Si misura come la fila del gestionale
 *
 * Stesse forme e stesso conto (`useFilaAdattiva`): nome intero quando c'è
 * spazio, nome breve, nome sotto l'icona, e le ultime sezioni in «Altro».
 * Prima la fila aveva soglie fisse e non si comprimeva mai: a 1280 px
 * copriva il nome del locale da una parte e la sfera dell'agente dall'altra.
 */
export function NavigazioneImpostazioni() {
  const pathname = usePathname();
  const parametri = useSearchParams();
  const attiva = parteDa(parametri.get("sez") ?? parametri.get("parte"));

  /*
    Dentro una sottopagina — il brand, il Wi-Fi, i pagamenti, il piano DEM —
    nessuna sezione è aperta: le voci restano link e nessuna è accesa.
  */
  const nellaPagina = pathname === "/settings";
  const accesa = nellaPagina ? attiva : null;

  /* Le sezioni nella forma delle voci di barra, così «Altro» e la misura
     sono gli stessi del gestionale. */
  const voci: (NavItem & { id: string })[] = PARTI.map((parte) => ({
    id: parte.id,
    href: indirizzoParte(parte.id),
    label: parte.titolo,
    shortLabel: SEGNI[parte.id].breve,
    icon: SEGNI[parte.id].icona,
  }));

  const ritorno = useRef<HTMLAnchorElement>(null);
  const fila = useFilaAdattiva({
    chiavi: voci.map((v) => v.id),
    attiva: accesa ?? null,
    riservaRef: ritorno,
  });
  const { forma } = fila;

  return (
    <nav
      ref={fila.navRef}
      aria-label="Sezioni delle impostazioni"
      className={cn(
        "relative hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex",
        !fila.misurata && "overflow-hidden",
      )}
    >
      <Link
        ref={ritorno}
        href="/overview"
        title="Torna al gestionale"
        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-line hover:text-foreground xl:text-sm"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden xl:inline">Gestionale</span>
        <span className="sr-only xl:hidden">Torna al gestionale</span>
      </Link>

      <div
        ref={fila.pillolaRef}
        className="relative flex min-w-0 items-center gap-1 rounded-full border border-border bg-muted/70 p-1"
      >
        <IndicatoreFila indicator={fila.indicator} reducedMotion={fila.reducedMotion} />

        {fila.visibili.map((i) => {
          const voce = voci[i];
          const questa = voce.id === accesa;
          return (
            <Link
              key={voce.id}
              href={voce.href}
              title={voce.label}
              aria-current={questa ? "page" : undefined}
              ref={fila.registra(voce.id)}
              className={classiVoceIn(questa, forma)}
            >
              <ContenutoVoce item={voce} forma={forma} breveInRiga />
            </Link>
          );
        })}

        {fila.nascoste.length > 0 && (
          <MenuAltro voci={fila.nascoste.map((i) => voci[i])} forma={forma} etichetta="Altre impostazioni" />
        )}
      </div>

      <CopiaDaMisurare misuraRef={fila.misuraRef}>
        {(f) =>
          voci.map((voce) => (
            <span key={voce.id} data-voce className={classiVoceIn(false, f)}>
              <ContenutoVoce item={voce} forma={f} breveInRiga />
            </span>
          ))
        }
      </CopiaDaMisurare>
    </nav>
  );
}

/**
 * Le altre sezioni, sul telefono, **in fondo alla sezione aperta**.
 *
 * In alto non può stare: su telefono la testata non porta voci — la
 * navigazione è la barra in basso — e infilarci cinque pillole vorrebbe dire
 * due file di navigazione su uno schermo da 390 px.
 *
 * E sta in **fondo** e non in cima, perché in cima c'è già la via di ritorno
 * all'indice, che è il posto da cui si scelgono le sezioni: una fila di
 * pillole sopra un titolo di sezione, con l'indice a schede a un tocco di
 * distanza, sarebbe la stessa scelta offerta due volte in due forme diverse.
 * Qui invece risponde alla domanda che viene **dopo** aver finito: «e le
 * altre?».
 */
export function AltreSezioniMobile({ attiva }: { attiva: string }) {
  const altre = PARTI.filter((p) => p.id !== attiva);

  return (
    <div className="mt-10 border-t border-border pt-5 md:hidden">
      <p className="t-etichetta">Altre impostazioni</p>
      <nav
        aria-label="Altre sezioni delle impostazioni"
        className="mt-3 flex flex-col gap-2"
      >
        {altre.map((parte) => (
          <Link
            key={parte.id}
            href={indirizzoParte(parte.id)}
            className={cn(
              "flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm transition-colors",
              "hover:border-line-40 hover:text-foreground",
            )}
          >
            <span className="min-w-0 truncate">{parte.titolo}</span>
            <span className="t-nota shrink-0">{parte.dentro.length} voci</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
