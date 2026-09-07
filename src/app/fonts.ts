
import {
  Crimson_Pro,
  Geist,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  JetBrains_Mono,
  Literata,
  Lora,
  Newsreader,
  Nunito_Sans,
  Source_Serif_4,
  Spectral,
  Work_Sans,
} from "next/font/google";

export const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  display: "swap",
});

export const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  display: "swap",
});

export const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  display: "swap",
});

export const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

export const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
});

export const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

export const crimsonPro = Crimson_Pro({
  variable: "--font-crimson-pro",
  subsets: ["latin"],
  display: "swap",
});

export const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const fontVariables = [
  geistSans.variable,
  inter.variable,
  ibmPlexSans.variable,
  workSans.variable,
  nunitoSans.variable,
  literata.variable,
  sourceSerif.variable,
  newsreader.variable,
  lora.variable,
  crimsonPro.variable,
  spectral.variable,
  jetbrainsMono.variable,
  ibmPlexMono.variable,
].join(" ");
