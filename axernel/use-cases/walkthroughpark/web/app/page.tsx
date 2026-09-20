import Link from "next/link"

import { configPath, isConfigured } from "@/lib/server/axernel"
import { listWalks } from "@/lib/server/db"
import { toWalkthrough } from "@/lib/server/walkthroughs"
import type { Walkthrough } from "@/lib/types"

import { Bench, Squiggle, Sun, Tree } from "./doodles"
import { GateForm } from "./GateForm"
import { statusTone, statusWord } from "./status"

export const dynamic = "force-dynamic"

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
]

function relativeTime(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit)
  }
  return "just now"
}

const shortSource = (walk: Walkthrough): string => walk.source.replace("https://github.com/", "") + (walk.subdir ? ` · ${walk.subdir}` : "")

export default function GatePage() {
  const configured = isConfigured()
  const walks = listWalks().map(toWalkthrough)

  return (
    <div className="gate">
      <section className="gate-hero">
        <Sun className="doodle doodle-sun" />
        <h1 className="gate-title">
          Drop a repo or PR link
          <Squiggle />
        </h1>
        <p className="lede">I will read it, boot the app, and walk you through it in a short narrated video.</p>
      </section>

      {configured ? (
        <GateForm />
      ) : (
        <section className="card card-sun notice" role="status">
          <h2>The park is not open yet</h2>
          <p>Run the bootstrap first. It sets up the Axernel project and agent, then writes the config this page reads.</p>
          <p className="mono">{configPath()}</p>
        </section>
      )}

      <section className="shelf" aria-labelledby="shelf-title">
        <div className="shelf-head">
          <h2 id="shelf-title">Past walks</h2>
          <Bench className="doodle doodle-bench" />
        </div>
        {walks.length === 0 ? (
          <p className="quiet">Nothing here yet. The first walk shows up on this shelf.</p>
        ) : (
          <ul className="shelf-list">
            {walks.map((walk) => (
              <li key={walk.id}>
                <Link href={`/w/${walk.id}`} className="card shelf-item tilt">
                  <span className="shelf-name">{walk.result?.title || shortSource(walk)}</span>
                  <span className="shelf-meta">
                    <span className={`stamp stamp-${statusTone(walk.status)}`}>{statusWord(walk.status)}</span>
                    <span className="quiet">{relativeTime(walk.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Tree className="doodle doodle-tree" />
      </section>
    </div>
  )
}
