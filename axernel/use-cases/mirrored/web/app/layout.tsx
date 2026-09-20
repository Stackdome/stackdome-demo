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

export const viewport: Viewport = { width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={jost.variable}>
      <body>
        <TopBar />
        <main>{children}</main>
      </body>
    </html>
  )
}
