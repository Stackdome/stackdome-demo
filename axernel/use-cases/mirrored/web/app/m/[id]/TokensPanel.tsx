"use client"

import { useEffect, useState, type ReactNode } from "react"

import { cssVariable, flattenTokens, fontStackCss, tokenTotal, type TokenSheet } from "@/lib/flattenTokens"
import { isTerminal, type Mirror } from "@/lib/types"

import { artifactUrl } from "./Compare"

type Loaded = { state: "loading" } | { state: "failed" } | { state: "ready"; sheet: TokenSheet }

/** tokens.json, fetched once the run has it. */
function useTokenSheet(mirror: Mirror): Loaded | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const available = mirror.artifacts.tokens

  useEffect(() => {
    if (!available) return
    let stale = false
    setLoaded({ state: "loading" })
    fetch(artifactUrl(mirror.id, "tokens"))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((tokens: unknown) => !stale && setLoaded({ state: "ready", sheet: flattenTokens(tokens) }))
      .catch(() => !stale && setLoaded({ state: "failed" }))
    return () => {
      stale = true
    }
  }, [available, mirror.id])

  return available ? loaded : null
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className="token-group">
      <h3>
        {title} <span className="count">{count}</span>
      </h3>
      {children}
    </div>
  )
}

const BAR_MAX_PX = 240

function Sheet({ sheet }: { sheet: TokenSheet }) {
  const sample = sheet.families[0] ? fontStackCss(sheet.families[0].stack) : "inherit"
  return (
    <div className="tokens">
      <Group title="Colour" count={sheet.colors.length}>
        <ul className="swatches">
          {sheet.colors.map((color) => (
            <li key={color.name}>
              <span className="swatch-chip" style={{ background: color.hex }} />
              <span className="swatch-name">{color.name}</span>
              <code>{color.hex}</code>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Type" count={sheet.families.length + sheet.sizes.length + sheet.weights.length + sheet.styles.length}>
        {sheet.families.map((family) => (
          <p key={family.name} className="type-family">
            <span className="type-family-name" style={{ fontFamily: fontStackCss(family.stack) }}>
              {family.stack[0]}
            </span>
            <span className="token-note">
              {family.name}, then {family.stack.slice(1).join(", ") || "nothing"}
            </span>
          </p>
        ))}
        <ul className="type-scale">
          {sheet.sizes.map((size) => (
            <li key={size.name}>
              {/* Capped so one display size cannot push the pane sideways. */}
              <span className="type-sample" style={{ fontFamily: sample, fontSize: `min(${size.css}, 40px)` }}>
                The mirror never lies
              </span>
              <span className="token-note">
                {size.name} <code>{size.css}</code>
              </span>
            </li>
          ))}
        </ul>
        {sheet.styles.length > 0 ? (
          <ul className="type-scale">
            {sheet.styles.map((style) => (
              <li key={style.name}>
                {/* The style as written, with its size capped like the scale above. */}
                <span
                  className="type-sample"
                  style={{
                    fontFamily: style.fontFamily ?? sample,
                    fontSize: style.fontSize ? `min(${style.fontSize}, 40px)` : undefined,
                    fontWeight: style.fontWeight ?? undefined,
                  }}
                >
                  The mirror never lies
                </span>
                <span className="token-note">
                  {style.name} <code>{[style.fontSize, style.fontWeight, style.lineHeight && `/ ${style.lineHeight}`].filter(Boolean).join(" ")}</code>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {sheet.weights.length > 0 ? (
          <ul className="type-weights">
            {sheet.weights.map((weight) => (
              <li key={weight.name}>
                <span style={{ fontFamily: sample, fontWeight: weight.weight }}>Aa</span>{" "}
                <span className="token-note">
                  {weight.name} {weight.weight}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Group>

      <Group title="Radius" count={sheet.radii.length}>
        <ul className="radii">
          {sheet.radii.map((radius) => (
            <li key={radius.name}>
              <span className="radius-shape" style={{ borderRadius: radius.css }} />
              <span className="token-note">
                {radius.name} <code>{radius.css}</code>
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Spacing" count={sheet.spacing.length}>
        <ul className="spacing">
          {sheet.spacing.map((step) => (
            <li key={step.name}>
              <span className="token-note">
                {step.name} <code>{step.css}</code>
              </span>
              <span className="spacing-bar" style={{ width: `${Math.min(step.px ?? 0, BAR_MAX_PX)}px` }} />
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Shadow" count={sheet.shadows.length}>
        <ul className="shadows">
          {sheet.shadows.map((shadow) => (
            <li key={shadow.name}>
              <span className="shadow-box" style={{ boxShadow: shadow.css }} />
              <span className="token-note">
                {shadow.name} <code title={shadow.css}>{cssVariable("shadow", shadow.name)}</code>
              </span>
            </li>
          ))}
        </ul>
      </Group>
    </div>
  )
}

export function TokensPanel({ mirror }: { mirror: Mirror }) {
  const loaded = useTokenSheet(mirror)
  if (loaded === null) return <p className="quiet">{isTerminal(mirror.status) ? "This mirror came back without tokens." : "None yet. They are named once the page has been measured."}</p>
  if (loaded.state === "loading") return <p className="quiet">Fetching tokens…</p>
  if (loaded.state === "failed") return <p className="form-error">Could not read tokens.json. Download it to see what the agent wrote.</p>
  if (tokenTotal(loaded.sheet) === 0) return <p className="quiet">tokens.json is there, but nothing in it follows the token format.</p>
  return (
    <>
      <Sheet sheet={loaded.sheet} />
      <p>
        <a className="text-link" href={`${artifactUrl(mirror.id, "tokens")}?download=1`}>
          Download tokens.json
        </a>
      </p>
    </>
  )
}
