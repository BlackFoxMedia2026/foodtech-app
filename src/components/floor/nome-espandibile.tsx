import { cn } from "@/lib/utils";

/**
 * Il nome di una voce che di solito è solo un'icona.
 *
 * Chiuso non occupa spazio; si apre quando il puntatore passa sulla voce o
 * la tastiera ci arriva (il contenitore deve avere `group`), e resta aperto
 * con `aperto` — la vista scelta, per esempio, che deve dire dove si è.
 * La larghezza scorre con `grid-template-columns` da 0fr a 1fr: è l'unico
 * modo di animare fino alla larghezza del testo senza misurarlo.
 */
export function NomeEspandibile({ children, aperto }: { children: React.ReactNode; aperto?: boolean }) {
  return (
    <span
      className={cn(
        "grid transition-[grid-template-columns,margin] duration-300 ease-out motion-reduce:transition-none",
        aperto
          ? "ml-1.5 grid-cols-[1fr]"
          : "ml-0 grid-cols-[0fr] group-hover:ml-1.5 group-hover:grid-cols-[1fr] group-focus-visible:ml-1.5 group-focus-visible:grid-cols-[1fr]",
      )}
    >
      <span className="overflow-hidden whitespace-nowrap">{children}</span>
    </span>
  );
}
