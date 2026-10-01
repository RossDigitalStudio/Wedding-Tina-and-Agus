import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A&A Wedding Planner",
  description: "Organizador privado del casamiento de Agustina y Agustín",
  appleWebApp: {
    capable: true,
    title: "Agustina & Agustín",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
