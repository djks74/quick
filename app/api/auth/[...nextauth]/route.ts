import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: any = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        console.log("Authorize called with:", { email: credentials?.email });
        if (!credentials?.email || !credentials?.password) {
          console.log("Missing credentials");
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { stores: true }
        });

        console.log("User found:", user ? "Yes" : "No");

        if (!user) {
          console.log("User not found");
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        console.log("Password valid:", isValid);

        if (!isValid) {
          console.log("Invalid password");
          return null;
        }

        // Return user object with store info (we'll expand token later)
        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          storeId: user.stores[0]?.id || null, // Assume first store for now
          storeSlug: user.stores[0]?.slug || null
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
    }
  },
  pages: {
    signIn: '/login',
    newUser: '/register'
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
