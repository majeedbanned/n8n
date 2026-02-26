import type { Metadata } from "next";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { SignOutButton } from "@/components/sign-out-button";
import { authOptions } from "@/lib/auth-options";
import "./globals.css";

const sans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Conversation Viewer",
  description: "Internal viewer for broker client conversations",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <div className="bg-layer" />
        {session?.user ? (
          <header className="topbar">
            <div className="topbar-inner">
              <Link href="/clients" className="brand">
                Broker Conversation Viewer
              </Link>
              <div className="topbar-actions">
                <span className="muted">{session.user.name}</span>
                <SignOutButton />
              </div>
            </div>
          </header>
        ) : null}
        <main className="page-shell">{children}</main>
      </body>
    </html>
  );
}