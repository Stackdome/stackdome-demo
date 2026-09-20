"use client"

import { useEffect, useState } from "react"

import { firstLines, installNames, itemCode, registryItems, shadcnCommand, themeCss } from "@/lib/registry"
import { isTerminal, type Mirror } from "@/lib/types"

import { artifactUrl } from "./Compare"

const FOLDED_LINES = 14

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url).catch(() => null)
  return response?.ok ? response.json().catch(() => null) : null
}

interface Registry {
  names: string[]
  /** The registry-item JSON of each name, in the same order; null where it could not be read. */
  items: unknown[]
}

const NO_REGISTRY: Registry = { names: [], items: [] }

/** The mirror's registry: what /r/<id>/index.json lists, and each item it names.
 *  Null until it is known; empty when the run has none or it could not be read. */
function useRegistry(mirror: Mirror): Registry | null {
  const [registry, setRegistry] = useState<Registry | null>(null)
  const available = mirror.artifacts.registry
  // A fresh array on every refetch of the mirror; its content is what the effect depends on.
  const componentsJson = JSON.stringify(mirror.result?.components ?? null)

  useEffect(() => {
    if (!available) return
    let stale = false
    void (async () => {
      const names = installNames(JSON.parse(componentsJson), registryItems(await readJson(`/r/${mirror.id}/index.json`)))
      const items = await Promise.all(names.map((name) => readJson(`/r/${mirror.id}/${name}.json`)))
      if (!stale) setRegistry({ names, items })
    })()
    return () => {
      stale = true
    }
  }, [available, mirror.id, componentsJson])

  return available ? registry : NO_REGISTRY
}

function CopyButton({ text, what }: { text: string; what: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button type="button" className="copy" onClick={copy} aria-label={`Copy ${what}`}>
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

/** Source to paste: folded to a few lines until asked for, copied whole either way. */
function CodeBlock({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false)
  const whole = text.replace(/\n+$/, "")
  const folded = firstLines(text, FOLDED_LINES)
  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span className="heavy-label">{title}</span>
        <CopyButton text={text} what={title} />
      </div>
      <pre className="snippet">{open ? whole : folded.text}</pre>
      {folded.cut ? (
        <button type="button" className="copy" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show less" : `Show all ${whole.split("\n").length} lines`}
        </button>
      ) : null}
    </div>
  )
}

const FLIP_SNIPPET = `import { applyTheme, clearTheme } from "./theme"
applyTheme()  // the mirrored look, as CSS variables on :root
clearTheme()  // back to your own theme`

export function CodePanel({ mirror }: { mirror: Mirror }) {
  const registry = useRegistry(mirror)
  // The command has to name this server as the registry, and only the browser knows its address.
  const [origin, setOrigin] = useState("")
  useEffect(() => setOrigin(window.location.origin), [])

  const fonts = mirror.result?.fonts ?? []
  if (!mirror.artifacts.bundle && !mirror.artifacts.registry) {
    return <p className="quiet">{isTerminal(mirror.status) ? "This mirror came back without code. The field notes say how far it got." : "Nothing yet. The code is packed at the very end."}</p>
  }
  if (!registry) return <p className="quiet">Reading the code…</p>

  const sources = registry.items.flatMap((item) => {
    const code = itemCode(item)
    return code ? [code] : []
  })
  const theme = themeCss(registry.items)
  const installable = registry.names.length > 0

  return (
    <div className="code">
      {sources.length > 0 ? (
        <>
          <p>Works in any React + Tailwind v4 project. shadcn is only a convenience.</p>
          <h3>Copy the code</h3>
          {sources.map((source) => (
            <CodeBlock key={source.fileName} title={source.fileName} text={source.content} />
          ))}
          {theme ? <CodeBlock title="Theme (paste into your Tailwind v4 CSS)" text={theme} /> : null}
        </>
      ) : null}

      {installable ? (
        <>
          <h3>Or install with shadcn</h3>
          <ul className="commands">
            {registry.names.map((name) => (
              <li key={name} className="command">
                <code>{shadcnCommand(origin, mirror.id, name)}</code>
                <CopyButton text={shadcnCommand(origin, mirror.id, name)} what={`the shadcn command for ${name}`} />
              </li>
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
            <a className={installable ? "text-link" : "button"} href={`${artifactUrl(mirror.id, "bundle")}?download=1`}>
              Download bundle.zip
            </a>
            {installable ? " has the same files, with a README." : null}
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
