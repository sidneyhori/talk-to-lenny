import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-handwriting",
});

export const metadata: Metadata = {
  title: "Talk to Lenny - Explore Lenny's Podcast",
  description:
    "AI-powered exploration of Lenny Rachitsky's podcast transcripts. Chat with 303 episodes, discover insights, and visualize connections.",
  keywords: [
    "Lenny Rachitsky",
    "podcast",
    "product management",
    "AI chat",
    "transcripts",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${caveat.variable} min-h-screen flex flex-col`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
