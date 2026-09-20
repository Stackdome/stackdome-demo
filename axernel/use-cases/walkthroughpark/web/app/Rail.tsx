"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { relativeTime } from "@/lib/relativeTime"
import type { Walkthrough } from "@/lib/types"

import { Bench } from "./doodles"
import { statusTone, statusWord } from "./status"

const shortSource = (walk: Walkthrough): string => walk.source.replace("https://github.com/", "") + (walk.subdir ? ` · ${walk.subdir}` : "")

/** Past walks, newest first. Asks again on every navigation (a walk was
 *  probably just started) and on a slow timer so statuses catch up. */
function usePastWalks(initial: Walkthrough[], pathname: string): Walkthrough[] {
  const [walks, setWalks] = useState(initial)

  useEffect(() => {
    let stale = false
    async function refetch() {
      const response = await fetch("/api/walkthroughs", { cache: "no-store" }).catch(() => null)
      if (!response?.ok || stale) return
      setWalks(((await response.json()) as { walkthroughs: Walkthrough[] }).walkthroughs)
    }
    void refetch()
    // ponytail: fixed 10s poll of the whole list; switch to SSE if the list grows or needs to feel live.
    const timer = setInterval(() => void refetch(), 10_000)
    return () => {
      stale = true
      clearInterval(timer)
    }
  }, [pathname])

  return walks
}

export function Rail({ initial }: { initial: Walkthrough[] }) {
  const pathname = usePathname()
  const walks = usePastWalks(initial, pathname)
  // Only matters below 900px, where the rail folds away under the wordmark.
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])

  return (
    <aside
      className="rail"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false)
      }}
    >
      <div className="rail-head">
        <button type="button" className="rail-toggle" aria-expanded={open} aria-controls="rail-body" onClick={() => setOpen(!open)}>
          Past walks
        </button>
      </div>

      <nav id="rail-body" className="rail-body" data-open={open} aria-label="Walks">
        <Link href="/" className="button button-small rail-new tilt" aria-current={pathname === "/" ? "page" : undefined}>
          + New walk
        </Link>
        <h2 className="rail-title">Past walks</h2>
        {walks.length === 0 ? (
          <div className="rail-empty">
            <Bench className="doodle" width={105} height={56} />
            <p className="quiet">Nobody has walked here yet. Your first walk will wait for you on this bench.</p>
          </div>
        ) : (
          <ul className="rail-list">
            {walks.map((walk) => (
              <li key={walk.id}>
                <Link href={`/w/${walk.id}`} className="rail-item" aria-current={pathname === `/w/${walk.id}` ? "page" : undefined}>
                  <span className="rail-name">{walk.result?.title || shortSource(walk)}</span>
                  <span className="rail-meta">
                    <span className={`stamp stamp-${statusTone(walk.status)}`}>{statusWord(walk.status)}</span>
                    <span className="quiet" suppressHydrationWarning>
                      {relativeTime(walk.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  )
}
