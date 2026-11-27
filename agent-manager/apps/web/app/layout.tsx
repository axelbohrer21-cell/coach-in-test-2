import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coach In Manager",
  description: "Centre de pilotage de l'équipe d'agents Coach In.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="fr">
      <body className={cn("font-sans", "antialiased")}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
