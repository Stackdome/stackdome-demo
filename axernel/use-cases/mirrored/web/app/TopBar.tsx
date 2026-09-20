import Link from "next/link"

import { MirrorMark } from "./shapes"

/** The one bar every page shares: wordmark and credit left, two links right. */
export function TopBar() {
  return (
    <header className="bar">
      <div className="bar-brand">
        <Link href="/" className="wordmark">
          <MirrorMark className="wordmark-mark" />
          <span>Mirrored</span>
        </Link>
        <p className="credit">
          powered by{" "}
          <a href="https://github.com/Stackdome/axernel" target="_blank" rel="noreferrer">
            Axernel
          </a>
        </p>
      </div>
      <nav className="bar-links" aria-label="Main">
        <Link href="/">New</Link>
        <Link href="/archive">Archive</Link>
      </nav>
    </header>
  )
}
