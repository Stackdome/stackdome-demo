import type { Metadata, Viewport } from "next"
import { Gaegu, Karla } from "next/font/google"
import Link from "next/link"
import type { ReactNode } from "react"

import "./globals.css"

const display = Gaegu({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-display", display: "swap" })
const body = Karla({ subsets: ["latin"], variable: "--font-body", display: "swap" })

export const metadata: Metadata = {
  title: "WalkThroughPark",
  description: "Drop a repo or PR link, get a short narrated demo video.",
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="masthead">
          <Link href="/" className="wordmark">
            WalkThroughPark
          </Link>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  )
}
