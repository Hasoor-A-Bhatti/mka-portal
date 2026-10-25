import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import { Spotlight } from "@/components/spotlight";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "MKA Portal", template: "%s | MKA Portal" },
  description: "MKA Delegations operations portal",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#fbfaff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable}`}>
      <body>
        <Spotlight />
        {children}
      </body>
    </html>
  );
}
