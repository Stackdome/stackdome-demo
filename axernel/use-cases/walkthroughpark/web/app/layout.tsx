import type { Metadata, Viewport } from "next"
import { Gaegu, Karla } from "next/font/google"
import type { ReactNode } from "react"

import { listWalkthroughs } from "@/lib/server/walkthroughs"

import "./globals.css"
import { Rail } from "./Rail"

const display = Gaegu({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-display", display: "swap" })
const body = Karla({ subsets: ["latin"], variable: "--font-body", display: "swap" })

export const metadata: Metadata = {
  title: "WalkThroughPark",
  description: "Drop a repo or PR link, get a short narrated demo video.",
}

// The rail lists walks from the database, so no page can be prerendered.
export const dynamic = "force-dynamic"

export const viewport: Viewport = { width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="shell">
          <Rail initial={listWalkthroughs()} />
          <main className="page">{children}</main>
        </div>
      </body>
    </html>
  )
}
