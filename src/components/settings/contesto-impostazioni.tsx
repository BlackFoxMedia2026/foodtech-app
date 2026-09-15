"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PARTI, type ParteId } from "@/lib/parti-impostazioni";

/**
 * Il collante fra **la barra in alto** e **la pagina che scorre**.
 *
 * Le quattro voci delle Impostazioni stanno nella testata — che è nel layout,
 * fuori dalla pagina — e le quattro sezioni stanno nella pagina. Devono
 * parlarsi in due versi: un clic in barra porta alla sezione, e lo scorrere
 * della pagina accende la voce giusta.
 *
 * Perché un contesto e non un `id` nell'indirizzo: qui non si cambia pagina.
 * Le quattro voci non sono quattro destinazioni — sono quattro punti della
 * stessa pagina, e ogni clic che facesse ripartire un render del server
 * sarebbe un'attesa per scendere di duemila pixel.
 *
 * L'osservatore è **uno solo per tutta la pagina**, non uno per sezione, e non
 * c'è nessun listener sullo scorrimento: `IntersectionObserver` sveglia il
 * codice quando una sezione entra nella fascia alta della schermata e in
 * nessun altro momento.
 */

type Contesto = {
  /** La sezione che si sta guardando. */
  attiva: ParteId;
  /** Porta a una sezione. Falso se quella sezione non è in questa pagina —
   *  succede nelle sottopagine (`/settings/brand`), dove la voce in barra deve
   *  tornare a essere un link. */
  vaiA: (id: ParteId) => boolean;
  /** Una sezione si fa osservare. Da `SezioneImpostazioni`, via `ref`. */
  registra: (id: ParteId, el: HTMLElement | null) => void;
};

const Ctx = createContext<Contesto | null>(null);

export function ProviderImpostazioni({ children }: { children: ReactNode }) {
  const [attiva, setAttiva] = useState<ParteId>(PARTI[0].id);

  const elementi = useRef(new Map<ParteId, HTMLElement>());
  const visibili = useRef(new Set<ParteId>());
  const osservatore = useRef<IntersectionObserver | null>(null);
  /*
    Dopo un clic la pagina scorre per qualche centinaio di millisecondi, e
    durante il viaggio attraversa le sezioni che stanno in mezzo: senza questa
    tregua la voce accesa lampeggerebbe fra tre nomi prima di fermarsi su
    quello chiesto.
  */
  const tregua = useRef(0);

  const scegli = useCallback(() => {
    if (Date.now() < tregua.current) return;
    // Fra le sezioni che toccano la fascia alta vince **la prima in ordine di
    // pagina**: è quella sotto cui si sta leggendo.
    const prima = PARTI.find((p) => visibili.current.has(p.id));
    if (prima) setAttiva(prima.id);
  }, []);

  const apri = useCallback(() => {
    if (osservatore.current) return osservatore.current;
    osservatore.current = new IntersectionObserver(
      (voci) => {
        for (const voce of voci) {
          const id = voce.target.getAttribute("data-parte") as ParteId | null;
          if (!id) continue;
          if (voce.isIntersecting) visibili.current.add(id);
          else visibili.current.delete(id);
        }
        scegli();
      },
      {
        /*
          La fascia sensibile: dai 100 px sotto il bordo alto (la testata, che
          copre) fino a circa un terzo dello schermo. Una sezione è «quella che
          sto leggendo» quando il suo inizio è passato sotto la testata, non
          quando si vede un suo pezzo in fondo alla schermata.
        */
        rootMargin: "-100px 0px -65% 0px",
        threshold: 0,
      },
    );
    return osservatore.current;
  }, [scegli]);

  const registra = useCallback(
    (id: ParteId, el: HTMLElement | null) => {
      const vecchio = elementi.current.get(id);
      if (vecchio && vecchio !== el) {
        osservatore.current?.unobserve(vecchio);
        elementi.current.delete(id);
        visibili.current.delete(id);
      }
      if (el) {
        elementi.current.set(id, el);
        apri().observe(el);
      }
    },
    [apri],
  );

  const vaiA = useCallback((id: ParteId) => {
    const el = elementi.current.get(id);
    if (!el) return false;

    setAttiva(id);
    tregua.current = Date.now() + 900;

    const ridotto =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: ridotto ? "auto" : "smooth", block: "start" });

    /*
      L'indirizzo segue lo scorrimento senza aggiungere una voce alla
      cronologia: si può copiare il link a una sezione, e il tasto indietro
      continua a portare fuori dalle Impostazioni invece di risalire di quattro
      titoli.
    */
    window.history.replaceState(null, "", `/settings#${id}`);
    return true;
  }, []);

  useEffect(() => () => osservatore.current?.disconnect(), []);

  const valore = useMemo<Contesto>(() => ({ attiva, vaiA, registra }), [attiva, vaiA, registra]);

  return <Ctx.Provider value={valore}>{children}</Ctx.Provider>;
}

export function useImpostazioni() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useImpostazioni va usato dentro ProviderImpostazioni");
  }
  return ctx;
}
