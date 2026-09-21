// Runs in the page: where every piece of text sits inside `root`, and how it is set.
// mir-measure saves this for the original; mir-reflect compares the rebuild against it,
// so a model that cannot see images still learns "the price sits 6px too low".
export function textRects(rootSelector) {
  const root = document.querySelector(rootSelector)
  if (!root) return []
  // Spans that sit on one line become one entry, so "Extra emails:" + "$0.90" + "/ 1,000" in the original and
  // one text node in the rebuild compare as the same line. Kept inside: this function runs in the page alone.
  function joinLines(rects) {
    const lines = []
    for (const rect of rects) {
      const last = lines.at(-1)
      const sameLine = last && Math.abs(last.y - rect.y) <= 3 && rect.x >= last.x && rect.x - (last.x + last.w) < 12
      if (sameLine) {
        last.text = `${last.text} ${rect.text}`.slice(0, 80)
        last.w = rect.x + rect.w - last.x
        last.h = Math.max(last.h, rect.h)
      } else lines.push({ ...rect })
    }
    return lines
  }
  const base = root.getBoundingClientRect()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const out = []
  for (let node = walker.nextNode(); node && out.length < 150; node = walker.nextNode()) {
    const text = node.textContent.trim().replace(/\s+/g, " ")
    if (!text) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    const box = range.getBoundingClientRect()
    const style = getComputedStyle(node.parentElement)
    if (!box.width || !box.height || style.visibility === "hidden" || Number(style.opacity) === 0) continue
    out.push({ text: text.slice(0, 60), x: Math.round(box.left - base.left), y: Math.round(box.top - base.top), w: Math.round(box.width), h: Math.round(box.height), size: style.fontSize, weight: style.fontWeight, color: style.color })
  }
  return joinLines(out)
}

/** Pairs texts by content, in order, and describes the worst differences in words. */
export function compareRects(original, rebuild, limit = 8) {
  const unused = [...rebuild]
  const notes = []
  for (const a of original) {
    const index = unused.findIndex((b) => b.text.replace(/\s+/g, "") === a.text.replace(/\s+/g, ""))
    if (index < 0) {
      notes.push({ weight: 1000, line: `MISSING "${a.text}" (original at x=${a.x} y=${a.y})` })
      continue
    }
    const [b] = unused.splice(index, 1)
    const parts = []
    for (const [key, label] of [["x", "dx"], ["y", "dy"], ["w", "dw"], ["h", "dh"]]) if (Math.abs(b[key] - a[key]) > 2) parts.push(`${label} ${b[key] - a[key] > 0 ? "+" : ""}${b[key] - a[key]}px`)
    for (const key of ["size", "weight", "color"]) if (a[key] !== b[key]) parts.push(`${key} ${b[key]} should be ${a[key]}`)
    if (parts.length) notes.push({ weight: Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + Math.abs(b.w - a.w) + Math.abs(b.h - a.h) + (parts.length > 0 ? 1 : 0), line: `TEXT "${a.text}" at x=${a.x} y=${a.y}: ${parts.join(", ")}` })
  }
  for (const b of unused.slice(0, 5)) notes.push({ weight: 500, line: `EXTRA "${b.text}" (rebuild at x=${b.x} y=${b.y}) is not in the original` })
  return notes.sort((p, q) => q.weight - p.weight).slice(0, limit).map((n) => n.line)
}
