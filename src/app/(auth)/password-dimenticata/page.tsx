import type { Metadata } from "next";
import { ModuloRecupero } from "@/components/auth/modulo-recupero";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Password dimenticata · Tavolo",
};

export default function PaginaPasswordDimenticata() {
  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md">
        <ModuloRecupero />
      </div>
    </div>
  );
}
