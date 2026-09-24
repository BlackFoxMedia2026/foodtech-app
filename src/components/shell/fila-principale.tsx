"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { classiVoceIn, isNavActive, sottovoceAttiva, type NavItem } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";
import { ContenutoVoce } from "./contenuto-voce";
import { FORME, type Forma } from "./disponi-fila";
import { MarketingMenu } from "./marketing-menu";
import { useFilaAdattiva } from "./use-fila-adattiva";

/** «Altro» ha la forma di una voce qualunque: icona e nome, come le altre. */
export const ALTRO = { icon: MoreHorizontal, label: "Altro" } as const;

/**
 * La fila delle voci del gestionale, **che si misura da sola**.
 *
 * Prima la barra cambiava forma a soglie fisse di finestra, e fra le soglie
 * non sapeva quanto spazio aveva: a 1440 px, con il nome del locale accanto
 * al titolo e nove voci, la pillola finiva sotto la sfera dell'agente. Adesso
 * la fila occupa quello che resta fra il marchio e gli strumenti di destra, lo
 * misura, e sceglie (`disponi-fila.ts`): tutto in riga, riga più stretta,
 * riga con «Altro», pila con «Altro».
 *
 * «Altro» qui **non** è il vecchio dropdown in mezzo alla barra che mescolava
 * servizio e amministrazione: porta solo le voci principali che in questa
 * larghezza non entrano, nello stesso ordine, e sparisce appena c'è posto. Le
 * voci amministrative restano sotto l'avatar.
 */
export function FilaPrincipale({ voci }: { voci: NavItem[] }) {
  const pathname = usePathname();
  const accesa = voci.find((item) => isNavActive(pathname, item));
  const fila = useFilaAdattiva({ chiavi: voci.map((v) => v.href), attiva: accesa?.href ?? null });
  const { forma } = fila;

  return (
    <nav
      ref={fila.navRef}
      aria-label="Navigazione principale"
      className={cn(
        "relative hidden min-w-0 flex-1 animate-cambio-area justify-center md:flex",
        !fila.misurata && "overflow-hidden",
      )}
    >
      <div
        ref={fila.pillolaRef}
        className="relative flex min-w-0 items-center gap-1 rounded-full border border-border bg-muted/70 p-1"
      >
        <IndicatoreFila indicator={fila.indicator} reducedMotion={fila.reducedMotion} />

        {fila.visibili.map((i) => {
          const item = voci[i];
          const active = item === accesa;

          /*
            Marketing è l'unica voce che non porta da nessuna parte: apre il
            suo menu. Prende **le stesse classi** delle altre — stessa pillola,
            stessa altezza, stessa forma — perché una voce che si comporta
            diversamente non deve anche sembrare diversa.
          */
          if (item.sottovoci) {
            return (
              <MarketingMenu
                key={item.href}
                item={item}
                forma={forma}
                triggerRef={fila.registra(item.href)}
                triggerClassName={classiVoceIn(active, forma)}
              />
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              ref={fila.registra(item.href)}
              title={item.label}
              className={classiVoceIn(active, forma)}
            >
              <ContenutoVoce item={item} forma={forma} />
            </Link>
          );
        })}

        {fila.nascoste.length > 0 && (
          <MenuAltro voci={fila.nascoste.map((i) => voci[i])} forma={forma} etichetta="Altre sezioni" />
        )}
      </div>

      <CopiaDaMisurare misuraRef={fila.misuraRef}>
        {(f) =>
          voci.map((item) => (
            <span key={item.href} data-voce className={classiVoceIn(false, f)}>
              <ContenutoVoce item={item} forma={f} freccia={Boolean(item.sottovoci)} />
            </span>
          ))
        }
      </CopiaDaMisurare>
    </nav>
  );
}

/** La pillola piena che scorre sotto la voce accesa. */
export function IndicatoreFila({
  indicator,
  reducedMotion,
}: {
  indicator: { left: number; width: number } | null;
  reducedMotion: boolean;
}) {
  if (!indicator) return null;
  return (
    <div
      aria-hidden="true"
      className="absolute inset-y-1 z-0 rounded-full bg-nav-pill"
      style={{
        left: indicator.left,
        width: indicator.width,
        transition: reducedMotion ? "none" : "left 260ms ease-in-out, width 260ms ease-in-out",
      }}
    />
  );
}

/**
 * La copia da misurare: tutte le voci, in tutte e tre le forme, più «Altro».
 *
 * Si misura questa e non la barra vera, così il conto non dipende da ciò che
 * il conto stesso ha appena deciso di mostrare. Invisibile, senza puntatore,
 * fuori dall'albero accessibile, e chiusa in un contenitore che taglia — così
 * la sua larghezza non allarga niente intorno.
 */
export function CopiaDaMisurare({
  misuraRef,
  children,
}: {
  misuraRef: React.RefObject<HTMLDivElement>;
  children: (forma: Forma) => React.ReactNode;
}) {
  return (
    <div aria-hidden="true" className="pointer-events-none invisible absolute inset-0 overflow-hidden">
      <div ref={misuraRef} className="flex w-max flex-col">
        {FORME.map((f) => (
          <div key={f} data-forma={f} className="flex">
            {children(f)}
            <span data-altro className={classiVoceIn(false, f)}>
              <ContenutoVoce item={ALTRO} forma={f} freccia />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * «Altro»: le voci che in questa larghezza non entrano.
 *
 * Marketing, se finisce qui, non diventa un menu dentro un menu: i suoi sette
 * strumenti si elencano sotto il suo nome, rientrati. Una tendina che ne apre
 * un'altra di lato, su un tablet, si chiude al primo dito che passa storto.
 */
export function MenuAltro({
  voci,
  forma,
  etichetta,
}: {
  voci: NavItem[];
  forma: Forma;
  /** Il nome del pannello, per chi legge e per chi ascolta lo schermo. */
  etichetta: string;
}) {
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={etichetta}
        className={cn(
          classiVoceIn(false, forma),
          // Da aperto, una pastiglia morbida e non il verde: il verde dice «sei
          // qui», e dentro «Altro» non ci si è.
          "group data-[state=open]:bg-veil-10 data-[state=open]:text-foreground",
        )}
      >
        <ContenutoVoce item={ALTRO} forma={forma} freccia />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        collisionPadding={12}
        aria-label={etichetta}
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 overflow-y-auto p-1.5"
      >
        <DropdownMenuLabel className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          {etichetta}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-1 mb-1 mt-0" />

        {voci.map((item) => {
          const Icon = item.icon;

          if (item.sottovoci) {
            const dentro = sottovoceAttiva(pathname, item);
            return (
              <div key={item.href} role="group" aria-label={item.label} className="py-0.5">
                <div className="flex items-center gap-2.5 px-3 pb-1 pt-2 text-sm font-medium text-popover-foreground">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </div>
                {item.sottovoci.map((voce) => {
                  const VoceIcon = voce.icon;
                  const attiva = dentro?.href === voce.href;
                  return (
                    <DropdownMenuItem key={voce.href} asChild className="min-h-[40px] pl-9">
                      <Link
                        href={voce.href}
                        aria-current={attiva ? "page" : undefined}
                        className={cn(attiva && "bg-black/20 font-medium text-accent-strong")}
                      >
                        <VoceIcon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
                        {voce.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            );
          }

          return (
            <DropdownMenuItem key={item.href} asChild className="min-h-[44px]">
              <Link href={item.href}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
