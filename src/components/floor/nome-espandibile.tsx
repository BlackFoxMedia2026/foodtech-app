import { cn } from "@/lib/utils";

/**
 * Il nome di una voce che di solito è solo un'icona.
 *
 * Chiuso non occupa spazio; si apre quando il puntatore passa sulla voce o
 * la tastiera ci arriva (il contenitore deve avere `group`), e resta aperto
 * con `aperto` — la vista scelta, per esempio, che deve dire dove si è.
 * La larghezza scorre con `grid-template-columns` da 0fr a 1fr: è l'unico
 * modo di animare fino alla larghezza del testo senza misurarlo.
 *
 * Con `apertoDa` resta aperto solo se c'è posto: un antenato deve essere un
 * contenitore (`[container-type:inline-size]`), e sotto quella larghezza il
 * nome torna a comparire al passaggio. «medio» per i gesti, «largo» per le
 * parole che accompagnano un numero, che si capisce anche da solo.
 */
export function NomeEspandibile({
  children,
  aperto,
  apertoDa,
}: {
  children: React.ReactNode;
  aperto?: boolean;
  apertoDa?: "medio" | "largo";
}) {
  return (
    <span
      className={cn(
        "grid transition-[grid-template-columns,margin] duration-300 ease-out motion-reduce:transition-none",
        aperto
          ? "ml-1.5 grid-cols-[1fr]"
          : "ml-0 grid-cols-[0fr] group-hover:ml-1.5 group-hover:grid-cols-[1fr] group-focus-visible:ml-1.5 group-focus-visible:grid-cols-[1fr]",
        !aperto && apertoDa === "medio" && "[@container(min-width:620px)]:ml-1.5 [@container(min-width:620px)]:grid-cols-[1fr]",
        !aperto && apertoDa === "largo" && "[@container(min-width:790px)]:ml-1.5 [@container(min-width:790px)]:grid-cols-[1fr]",
      )}
    >
      <span className="overflow-hidden whitespace-nowrap">{children}</span>
    </span>
  );
}
