import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { QueryProvider } from "@/lib/query/query-provider";
import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/primitives";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synapsys Note",
  description:
    "Pensado para quem faz concurso público, vestibular ou faculdade. Organize seus estudos com eficiência, transforme sua rotina em algo mais produtivo.",
  applicationName: "Synapsys Note",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Synapsys Note",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/mark-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/mark-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/mark-180.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07111C" },
    { media: "(prefers-color-scheme: light)", color: "#F4F7FA" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fontVariables} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full antialiased">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
              <Toaster
                position="bottom-right"
                visibleToasts={3}
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    borderRadius: "10px",
                    fontSize: "13px",
                  },
                }}
              />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
