import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { QueryProvider } from "@/lib/query/query-provider";
import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/primitives";
import { HTML_LANG } from "@/lib/i18n/locale";
import { fontVariables } from "./fonts";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "./globals.css";

const documentLanguageScript = `
(function(){
  try {
    var map = ${JSON.stringify(HTML_LANG)};
    var segment = window.location.pathname.split('/')[1];
    if (map[segment]) document.documentElement.lang = map[segment];
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: "Synapsys Note",
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
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
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
        <script dangerouslySetInnerHTML={{ __html: documentLanguageScript }} />
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
