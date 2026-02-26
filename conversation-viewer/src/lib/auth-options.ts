import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export type AdminUser = {
  username: string;
  passwordHash?: string;
  passwordPlain?: string;
  name?: string;
};

function getAdminUsers(): AdminUser[] {
  const fromB64 = process.env.ADMIN_USERS_JSON_B64;
  if (fromB64) {
    try {
      const decoded = Buffer.from(fromB64, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as AdminUser[];
      const valid = parsed.filter(
        (user) =>
          Boolean(user.username) && (Boolean(user.passwordHash) || Boolean(user.passwordPlain)),
      );
      if (valid.length > 0) {
        return valid;
      }
    } catch {
      // ignore and try next source
    }
  }

  const fromJson = process.env.ADMIN_USERS_JSON;
  if (fromJson) {
    try {
      const parsed = JSON.parse(fromJson) as AdminUser[];
      const valid = parsed.filter(
        (user) =>
          Boolean(user.username) && (Boolean(user.passwordHash) || Boolean(user.passwordPlain)),
      );
      if (valid.length > 0) {
        return valid;
      }
    } catch {
      // ignore and try next source
    }
  }

  const username = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const passwordPlain = process.env.ADMIN_PASSWORD;

  if (username && (passwordHash || passwordPlain)) {
    return [{ username, passwordHash, passwordPlain, name: process.env.ADMIN_NAME || username }];
  }

  return [];
}

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Internal Login",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "").trim();
        const password = String(credentials?.password ?? "");

        if (!username || !password) {
          return null;
        }

        const users = getAdminUsers();
        const user = users.find((entry) => entry.username === username);
        if (!user) {
          return null;
        }

        if (user.passwordHash) {
          const normalizedHash = user.passwordHash.replace(/\\\$/g, "$");
          const matches = await bcrypt.compare(password, normalizedHash);
          if (matches) {
            return {
              id: user.username,
              name: user.name ?? user.username,
              email: `${user.username}@internal.local`,
            };
          }
        }

        if (user.passwordPlain && password === user.passwordPlain) {
          return {
            id: user.username,
            name: user.name ?? user.username,
            email: `${user.username}@internal.local`,
          };
        }

        return null;
      },
    }),
  ],
};
