import {
  Building2,
  CalendarRange,
  Megaphone,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { ParteId } from "@/lib/parti-impostazioni";

/**
 * Il simbolo e il nome corto di ogni sezione.
 *
 * Sta in un file **senza `"use client"`** perché lo legge sia l'indice — che è
 * del server — sia la barra in alto, che è del client: da un modulo client il
 * server non può leggere un valore esportato. È la quarta volta che questo
 * confine morde in questo progetto, e la regola resta quella: quello che
 * attraversa sta in un file suo.
 */
export const SEGNI: Record<
  ParteId,
  { icona: React.ComponentType<{ className?: string }>; breve: string }
> = {
  locale: { icona: Building2, breve: "Locale" },
  prenotazioni: { icona: CalendarRange, breve: "Prenot." },
  ospiti: { icona: Users, breve: "Ospiti" },
  /* Lo stesso megafono della voce in barra: è la stessa area del prodotto
     vista da due parti, e due simboli diversi la farebbero sembrare due cose. */
  marketing: { icona: Megaphone, breve: "Marketing" },
  sistema: { icona: SlidersHorizontal, breve: "Sistema" },
};
