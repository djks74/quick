import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";

export const authOptions: any = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        storeSlug: { label: "Store Slug", type: "text" }
      },
      async authorize(credentials) {
        await ensureStoreSettingsSchema();
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const loginId = credentials.email.toString().trim();
        const storeSlug = credentials.storeSlug?.toString().trim();

        if (storeSlug && !loginId.includes("@")) {
          const store = await prisma.store.findUnique({
            where: { slug: storeSlug },
            select: { id: true, slug: true }
          });

          if (!store) return null;

          const email = `pos+${store.id}@pos.local`;
          const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, role: true, password: true, workedAtId: true }
          });

          if (!user) return null;
          if (user.role !== "CASHIER") return null;
          if (user.workedAtId !== store.id) return null;
          if ((user.name || "").trim() !== loginId) return null;

          const isValid = await bcrypt.compare(credentials.password, user.password);
          if (!isValid) return null;

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            storeId: store.id,
            storeSlug: store.slug
          };
        }

        const user = await prisma.user.findUnique({
          where: { email: loginId },
          include: { stores: true }
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        // Return user object with store info (we'll expand token later)
        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          storeId: user.role === "CASHIER" ? (user.workedAtId || null) : (user.stores[0]?.id || null),
          storeSlug: user.role === "CASHIER" ? null : (user.stores[0]?.slug || null)
        };
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.storeId = user.storeId;
        token.storeSlug = user.storeSlug;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.storeId = token.storeId;
        session.user.storeSlug = token.storeSlug;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    newUser: '/register'
  }
};
