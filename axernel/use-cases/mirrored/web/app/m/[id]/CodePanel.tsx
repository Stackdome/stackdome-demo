"use client"

import { useEffect, useState } from "react"

import { installNames, registryItems, shadcnCommand, type RegistryItem } from "@/lib/registry"
import { isTerminal, type Mirror } from "@/lib/types"

import { artifactUrl } from "./Compare"

/** What the mirror's registry lists, read from /r/<id>/index.json once the run
 *  has a registry. Null until it is known; empty when it could not be read. */
function useRegistryItems(mirror: Mirror): RegistryItem[] | null {
  const [items, setItems] = useState<RegistryItem[] | null>(null)
  const available = mirror.artifacts.registry

  useEffect(() => {
    if (!available) return
    let stale = false
    fetch(`/r/${mirror.id}/index.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((index: unknown) => !stale && setItems(registryItems(index)))
      .catch(() => !stale && setItems([]))
    return () => {
      stale = true
    }
  }, [available, mirror.id])

  return available ? items : []
}

function Command({ name, command }: { name: string; command: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(command).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <li className="command">
      <span className="heavy-label">{name}</span>
      <code>{command}</code>
      <button type="button" className="command-copy" onClick={copy} aria-label={`Copy the command for ${name}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </li>
  )
}

const FLIP_SNIPPET = `import { applyTheme, clearTheme } from "./theme"
applyTheme()  // the mirrored look, as CSS variables on :root
clearTheme()  // back to your own theme`

export function CodePanel({ mirror }: { mirror: Mirror }) {
  const items = useRegistryItems(mirror)
  // The command has to name this server as the registry, and only the browser knows its address.
  const [origin, setOrigin] = useState("")
  useEffect(() => setOrigin(window.location.origin), [])

  // Without a registry to serve them, install lines would only 404: the bundle is what is left.
  const names = mirror.artifacts.registry && items ? installNames(mirror.result?.components, items) : []
  const fonts = mirror.result?.fonts ?? []
  if (!mirror.artifacts.bundle && !mirror.artifacts.registry) {
    return <p className="quiet">{isTerminal(mirror.status) ? "This mirror came back without code. The field notes say how far it got." : "Nothing yet. The code is packed at the very end."}</p>
  }

  return (
    <div className="code">
      {names.length > 0 ? (
        <>
          <p>Each line adds one React + Tailwind component, with its theme tokens, to a project that has shadcn/ui set up.</p>
          <ul className="commands">
            {names.map((name) => (
              <Command key={name} name={name} command={shadcnCommand(origin, mirror.id, name)} />
            ))}
          </ul>
        </>
      ) : null}
      {fonts.length > 0 ? (
        <p>
          <span className="heavy-label">Fonts</span> {fonts.join(", ")}
        </p>
      ) : null}
      {mirror.artifacts.bundle ? (
        <>
          <p>
            {names.length > 0 ? "No shadcn? " : ""}
            <a className={names.length > 0 ? "text-link" : "button"} href={`${artifactUrl(mirror.id, "bundle")}?download=1`}>
              Download bundle.zip
            </a>
            {names.length > 0 ? " has the same files, with a README." : null}
          </p>
          <div className="flip">
            <h3>Flip the look</h3>
            <p>
              The bundle has <code>theme.js</code>. It sets the design tokens as CSS variables at runtime, so you can switch the mirrored look on and off without a rebuild.
            </p>
            <pre className="snippet">{FLIP_SNIPPET}</pre>
          </div>
        </>
      ) : null}
    </div>
  )
}
