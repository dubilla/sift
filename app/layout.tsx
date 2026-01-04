import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  title: "Sift - Email Management",
  description: "Achieve inbox zero with intelligent email management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50 min-h-screen" style={{ fontFamily: 'Outfit, system-ui, -apple-system, sans-serif' }}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
