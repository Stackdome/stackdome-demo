import type { Metadata, Viewport } from "next"
import { Jost } from "next/font/google"
import type { ReactNode } from "react"

import "./globals.css"
import { TopBar } from "./TopBar"

// One geometric family in two weights: heavy to shout, light for everything else.
const jost = Jost({ subsets: ["latin"], weight: ["300", "800"], variable: "--font-jost", display: "swap" })

export const metadata: Metadata = {
  title: "Mirrored",
  description: "Paste a web page, get one section back as a React + Tailwind component themed by design tokens, checked against the original.",
}

// Runs before first paint, so a stored theme never flashes the other one. A constant
// string: it reads one key and accepts two values, and carries no data of anyone's.
const THEME_SCRIPT = `try{var t=localStorage.getItem("mirrored.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`

export const viewport: Viewport = { width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The script above may have set data-theme before React sees the element.
    <html lang="en" className={jost.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <TopBar />
        <main>{children}</main>
      </body>
    </html>
  )
}
