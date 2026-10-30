import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delivery Ops Agents",
  description: "5 agentes de IA analisam atrasos reais de entrega de um marketplace brasileiro (base pública da Olist), explicam as causas e propõem um plano de ação.",
};

// Aplica o tema antes da pintura para não piscar.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
