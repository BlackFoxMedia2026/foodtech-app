import { ChevronDown } from "lucide-react";
import type { Forma } from "./disponi-fila";
import type { NavItem } from "./nav-items";

/**
 * Icona e nome di una voce in barra, **nella forma scelta dalla fila**.
 *
 * Uno solo per tre usi — il link, il menu Marketing e la copia invisibile che
 * la fila misura — perché la misura vale solo se la copia è identica al pixel:
 * una freccia in più da una parte e la voce smette di entrare dove il conto
 * diceva che entrava.
 *
 * In riga il nome è sempre intero. Nella pila, dove sta sotto l'icona a 10 px,
 * si usa la stessa parola accorciata della barra del telefono («Prenot.»), e
 * chi ascolta lo schermo sente comunque il nome intero.
 */
export function ContenutoVoce({
  item,
  forma,
  freccia = false,
  breveInRiga = false,
}: {
  item: Pick<NavItem, "icon" | "label" | "shortLabel">;
  forma: Forma;
  /** La freccia delle voci che aprono un menu: solo in riga, dove c'è spazio. */
  freccia?: boolean;
  /**
   * Il nome breve anche in riga, e quello intero solo nella forma ampia. Serve
   * alle Impostazioni, dove «Il locale» e «Locale» sono la stessa sezione e la
   * forma breve è quella di tutti i giorni.
   */
  breveInRiga?: boolean;
}) {
  const Icon = item.icon;
  const breve =
    (forma === "pila" || (breveInRiga && forma === "riga")) &&
    item.shortLabel &&
    item.shortLabel !== item.label;
  return (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      {breve ? (
        <>
          <span aria-hidden="true">{item.shortLabel}</span>
          <span className="sr-only">{item.label}</span>
        </>
      ) : (
        <span>{item.label}</span>
      )}
      {freccia && forma !== "pila" && (
        <ChevronDown
          aria-hidden="true"
          className="-ml-0.5 h-3 w-3 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      )}
    </>
  );
}
