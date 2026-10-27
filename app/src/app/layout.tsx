import type { Metadata } from "next";
import "./globals.css";
import { FairProvider } from "@/lib/client";
import { Nav } from "@/components/Nav";
import { ConnectionBanner } from "@/components/ConnectionBanner";

export const metadata: Metadata = {
  title: "FairShift",
  description: "Decent-work platform: wage transparency, safety and grievance resolution (SDG 8).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <FairProvider>
          <Nav />
          <ConnectionBanner />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        </FairProvider>
      </body>
    </html>
  );
}
