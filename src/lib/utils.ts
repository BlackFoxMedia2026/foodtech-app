import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Un importo in euro, **uguale sul server e nel browser**.
 *
 * `useGrouping: true` non è un vezzo tipografico: senza, per l'italiano le
 * cifre a quattro posizioni seguono `minimumGroupingDigits`, che vale 2 —
 * quindi 1118 diventa «1118,00 €» dove il CLDR di Node dice così e
 * «1.118,00 €» dove quello del browser dice altro. Il risultato era un
 * *hydration mismatch* in Ospiti: React buttava via l'HTML del server per
 * quella cella, e il numero cambiava sotto gli occhi fra il primo disegno e
 * il secondo. Trovato l'8 settembre guardando la console della pagina Ospiti.
 *
 * Con il raggruppamento dichiarato i due ambienti dicono la stessa cosa, e
 * per gli importi di un ristorante — dove le migliaia contano — è anche la
 * forma giusta.
 */
export function formatCurrency(cents: number, currency = "EUR", locale = "it-IT") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    useGrouping: true,
  }).format(cents / 100);
}

/**
 * Un numero decimale come lo scrive l'italiano: la virgola.
 *
 * «1.6 giri per tavolo» in italiano si legge male — il punto è il separatore
 * delle **migliaia**, e su una schermata che scrive «3.904,00 €» due centimetri
 * più su è una stonatura che si nota. Restituisce al massimo `decimali` cifre
 * dopo la virgola, senza zeri inutili in fondo.
 */
export function formatNumber(value: number, decimali = 1, locale = "it-IT") {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: decimali }).format(value);
}

export function formatDateTime(date: Date | string, locale = "it-IT") {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatDate(date: Date | string, locale = "it-IT") {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(date),
  );
}

export function formatTime(date: Date | string, locale = "it-IT") {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

export function initials(name?: string | null) {
  if (!name) return "·";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
