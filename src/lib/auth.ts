import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { db } from "./db";

/**
 * Quanto dura una sessione.
 *
 * Prima non era dichiarata, e valeva il valore per difetto di NextAuth:
 * **trenta giorni**. Un tablet dimenticato in sala restava dentro un mese, e
 * non c'è modo di revocare un token già emesso.
 *
 * Sette giorni, con rinnovo silenzioso ogni ventiquattr'ore mentre si lavora.
 * È un compromesso, e va detto quale: in un ristorante il dispositivo è
 * condiviso e chi apre il servizio non deve trovare la schermata d'accesso
 * ogni sera — ma un mese è troppo per una cosa che non si può richiamare
 * indietro. Il numero sta qui, in una riga, perché è una decisione del locale
 * più che del software.
 *
 * La revoca vera (invalidare le sessioni già emesse) richiede o le sessioni
 * sul database o una versione del token da confrontare a ogni richiesta: è in
 * roadmap, e accorciare la durata è la mitigazione che si può avere subito.
 */
const DURATA_SESSIONE_GIORNI = 7;

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: DURATA_SESSIONE_GIORNI * 24 * 60 * 60,
    // Ogni giorno di uso rinnova la scadenza: chi lavora non viene buttato
    // fuori a metà servizio, chi non apre Tavolo per una settimana rientra.
    updateAge: 24 * 60 * 60,
  },
  pages: { signIn: "/sign-in" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await db.user.findUnique({ where: { email: credentials.email.toLowerCase() } });
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
