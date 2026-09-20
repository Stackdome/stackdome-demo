"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import type { RunStatus } from "@/lib/types"
import { defaultTab, nextTab, tabFromHash, TABS, type WalkTab } from "@/lib/walkTabs"

/** The open tab: whatever the URL hash or the visitor picked, else the
 *  default for the run's status, so it moves to Overview when a run completes. */
export function useTab(status: RunStatus): [WalkTab, (tab: WalkTab) => void] {
  const [picked, setPicked] = useState<WalkTab | null>(null)

  useEffect(() => {
    const read = () => setPicked(tabFromHash(window.location.hash))
    read()
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [])

  function pick(tab: WalkTab) {
    setPicked(tab)
    // replaceState: flipping tabs should not pile up Back-button stops.
    window.history.replaceState(null, "", `#${tab}`)
  }

  return [picked ?? defaultTab(status), pick]
}

interface WalkTabsProps {
  active: WalkTab
  onSelect: (tab: WalkTab) => void
  labels: Record<WalkTab, ReactNode>
  panels: Record<WalkTab, ReactNode>
}

/** Index-card dividers over one card. Every panel stays mounted so the feed
 *  keeps its scroll position and nothing refetches on a tab change. */
export function WalkTabs({ active, onSelect, labels, panels }: WalkTabsProps) {
  const buttons = useRef<Partial<Record<WalkTab, HTMLButtonElement | null>>>({})

  return (
    <div className="tabs">
      <div
        role="tablist"
        aria-label="About this walk"
        className="tab-row"
        onKeyDown={(event) => {
          const to = nextTab(active, event.key)
          if (!to) return
          event.preventDefault()
          onSelect(to)
          buttons.current[to]?.focus()
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            ref={(element) => {
              buttons.current[tab] = element
            }}
            type="button"
            role="tab"
            id={`tab-${tab}`}
            className={`tab tab-${tab}`}
            aria-selected={tab === active}
            aria-controls={`panel-${tab}`}
            tabIndex={tab === active ? 0 : -1}
            onClick={() => onSelect(tab)}
          >
            {labels[tab]}
          </button>
        ))}
      </div>
      {TABS.map((tab) => (
        <div key={tab} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="card tab-panel" hidden={tab !== active} tabIndex={0}>
          {panels[tab]}
        </div>
      ))}
    </div>
  )
}
