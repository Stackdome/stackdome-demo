import Link from "next/link"

import { Highlighter } from "./doodles"

/** The quiet line under the wordmark. */
export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`credit ${className}`.trim()}>
      powered by{" "}
      <a href="https://github.com/Stackdome/axernel" target="_blank" rel="noreferrer">
        Axernel
      </a>
    </p>
  )
}

/** The masthead: the wordmark with its credit, centred over the page. */
export function Brand() {
  return (
    <header className="brand">
      <Link href="/" className="wordmark">
        <Highlighter className="wordmark-swash" />
        <span>WalkThroughPark</span>
      </Link>
      <Credit />
    </header>
  )
}
