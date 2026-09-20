"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { archiveScore, cardTone, hostOf } from "@/lib/mirrorLabel"
import { relativeTime } from "@/lib/relativeTime"
import { isTerminal, type Mirror } from "@/lib/types"

import { ScoreDial } from "../shapes"
import { statusWord } from "../status"

/** Past mirrors, newest first. Asked again on a slow timer while any of them
 *  is still running, so its card catches up. */
function usePastMirrors(initial: Mirror[]): Mirror[] {
  const [mirrors, setMirrors] = useState(initial)
  const live = mirrors.some((mirror) => !isTerminal(mirror.status))

  useEffect(() => {
    if (!live) return
    let stale = false
    // ponytail: fixed 10s poll of the whole list; switch to SSE if the list grows or needs to feel live.
    const timer = setInterval(async () => {
      const response = await fetch("/api/mirrors", { cache: "no-store" }).catch(() => null)
      if (response?.ok && !stale) setMirrors(((await response.json()) as { mirrors: Mirror[] }).mirrors)
    }, 10_000)
    return () => {
      stale = true
      clearInterval(timer)
    }
  }, [live])

  return mirrors
}

/** What of the site was mirrored: the agent's title, else what was asked for. */
const subject = (mirror: Mirror): string => mirror.result?.title?.trim() || (mirror.mode === "brand" ? "Whole brand" : (mirror.target ?? "One section"))

function Card({ mirror, index }: { mirror: Mirror; index: number }) {
  const score = archiveScore(mirror)
  return (
    <li>
      <Link href={`/m/${mirror.id}`} className={`card card-${cardTone(index)}`}>
        <span className="card-host">{hostOf(mirror.url)}</span>
        <span className="card-subject">{subject(mirror)}</span>
        <span className="card-foot">
          <span>
            {statusWord(mirror.status)}
            <span className="card-when" suppressHydrationWarning>
              {relativeTime(mirror.createdAt)}
            </span>
          </span>
          {score === null ? null : (
            <span className="card-score">
              <ScoreDial matchScore={score} mono className="card-dial" />
              <span aria-hidden="true">{score}</span>
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}

export function Archive({ initial }: { initial: Mirror[] }) {
  const mirrors = usePastMirrors(initial)
  return (
    <div className="archive">
      <h1 className="archive-title">
        <span className="heavy">Archive</span>
        <span className="light">{mirrors.length === 0 ? "nothing mirrored yet" : `${mirrors.length} ${mirrors.length === 1 ? "mirror" : "mirrors"}, newest first`}</span>
      </h1>
      {mirrors.length === 0 ? (
        <p>
          <Link href="/" className="button">
            Mirror a page
            <span className="button-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </p>
      ) : (
        <ul className="cards">
          {mirrors.map((mirror, index) => (
            <Card key={mirror.id} mirror={mirror} index={index} />
          ))}
        </ul>
      )}
    </div>
  )
}
