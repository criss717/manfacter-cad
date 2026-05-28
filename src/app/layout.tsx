import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Manfacter Studio — Diseño 3D con IA",
    template: "%s | Manfacter Studio",
  },
  description:
    "Crea piezas 3D para impresión y fabricación usando lenguaje natural. Exporta a STL, STEP y más.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.className} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-fog text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
