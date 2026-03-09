import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: string
      storeId?: number | null
      storeSlug?: string | null
    }
  }

  interface User {
    id: string
    role: string
    storeId?: number | null
    storeSlug?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: string
    storeId?: number | null
    storeSlug?: string | null
  }
}
