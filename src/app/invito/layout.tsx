import { TemaCarta } from "@/components/tema-carta";

/** L'accesso al back office è già back office: porta il tema Carta. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TemaCarta />
      {children}
    </>
  );
}
