"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isNavActive, sottovoceAttiva, type NavItem } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

/**
 * Marketing, in barra, **è un menu e non una destinazione**.
 *
 * Prima era una voce come le altre e portava a `/marketing`: una pagina il cui
 * unico contenuto erano sei riquadri, uno per strumento. Chi voleva i coupon
 * faceva tre gesti — apri Marketing, leggi l'indice, apri Coupon — e i primi
 * due non gli davano niente che non sapesse già. Adesso l'indice è questo
 * pannello: il primo clic mostra le sette porte, il secondo è quello che apre
 * una porta.
 *
 * Perché un pannello largo e non un menu da modulo: sette voci con un nome
 * solo si leggono una per una finché non si trova quella giusta, e «Wi-Fi»
 * accanto a «QR Code» non dice a cosa servono. Una riga di descrizione sotto
 * ogni nome costa spazio orizzontale, e due colonne lo restituiscono
 * all'altezza — sette voci in colonna singola sarebbero una tendina lunga mezzo
 * schermo.
 *
 * Il pannello non è un cruscotto: nessun numero, nessuna card. Quelli erano il
 * motivo per cui la pagina raccoglitore sembrava valere una fermata, e non la
 * valeva.
 */
export function MarketingMenu({
  item,
  triggerClassName,
  triggerRef,
}: {
  item: NavItem;
  triggerClassName: string;
  /** Il misuratore della pillola crema in barra: vale per un bottone come per
   *  un link, purché l'elemento sia lo stesso che occupa il posto in fila. */
  triggerRef: (el: HTMLElement | null) => void;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = isNavActive(pathname, item);
  const aperta = sottovoceAttiva(pathname, item);
  const voci = item.sottovoci ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={triggerRef}
        title={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(triggerClassName, "group")}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="hidden 2xl:inline">{item.label}</span>
        <span className="hidden md:inline 2xl:hidden">{item.shortLabel ?? item.label}</span>
        <span className="sr-only md:hidden">{item.label}</span>
        {/*
          La freccia compare **solo da 1536 px**, dove il nome è già intero e
          la fila ha spazio davanti e dietro.

          Non è una scelta estetica, è una misura: fra i 1280 e i 1536 px le
          otto voci arrivano a sfiorare il marchio a sinistra e la sfera
          dell'agente a destra, e questi 20 px (l'icona più il suo spazio)
          bastano a far sovrapporre le due cose a 1366 px. Sotto quella
          soglia a dire che è un menu ci pensa il pannello che si apre — e
          togliere un segno costa meno che nascondere mezza barra.
        */}
        <ChevronDown
          aria-hidden="true"
          className="hidden h-3 w-3 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180 2xl:block"
        />
      </DropdownMenuTrigger>

      {/*
        `align="start"` e non centrato: il pannello è più largo del pulsante e
        centrarlo lo farebbe sconfinare sotto «Staff» da una parte e «Menu»
        dall'altra, senza che si capisca da quale voce è uscito. Allineato a
        sinistra, il suo bordo e quello del pulsante sono la stessa linea.

        `collisionPadding` lo tiene dentro lo schermo su un portatile stretto,
        dove Marketing è la settima voce e sta già sul lato destro.
      */}
      <DropdownMenuContent
        align="start"
        collisionPadding={12}
        className="w-[min(92vw,34rem)] p-2"
        aria-label="Sezioni marketing"
      >
        <DropdownMenuLabel className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          {item.label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-1 mb-1.5 mt-0" />

        <div className="grid gap-0.5 sm:grid-cols-2">
          {voci.map((voce) => {
            const VoceIcon = voce.icon;
            const attiva = aperta?.href === voce.href;
            return (
              <DropdownMenuItem key={voce.href} asChild className="items-start gap-3 px-3 py-2.5">
                <Link
                  href={voce.href}
                  aria-current={attiva ? "page" : undefined}
                  className={cn(attiva && "bg-black/20")}
                >
                  <VoceIcon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      attiva ? "text-accent-strong" : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm leading-tight",
                        attiva ? "font-medium text-accent-strong" : "text-popover-foreground",
                      )}
                    >
                      {voce.label}
                    </span>
                    {voce.descrizione && (
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {voce.descrizione}
                      </span>
                    )}
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
