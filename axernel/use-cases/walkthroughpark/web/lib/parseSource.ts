export type ParsedSource =
  | { source: string; subdir?: string; treePath?: string; kind: "repo" | "pr" }
  | { error: string }

const NAME = /^[A-Za-z0-9._-]+$/

/** Turns a pasted GitHub link into the agent's `source` and `subdir`. */
export function parseSource(input: string): ParsedSource {
  const raw = input.trim()
  if (!raw) return { error: "Paste a GitHub repo or pull request link." }

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return { error: "That does not look like a link." }
  }
  const host = url.hostname.toLowerCase()
  if (host !== "github.com" && host !== "www.github.com") {
    return { error: "Only github.com links work here." }
  }

  const [owner, repoRaw, section, ...rest] = url.pathname.split("/").filter(Boolean)
  const repo = repoRaw?.replace(/\.git$/, "")
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) {
    return { error: "The link needs an owner and a repo, like github.com/owner/repo." }
  }
  const repoUrl = `https://github.com/${owner}/${repo}`

  if (section === "pull") {
    const number = rest[0]
    if (!number || !/^\d+$/.test(number)) return { error: "That pull request link has no number." }
    return { source: `${repoUrl}/pull/${number}`, kind: "pr" }
  }

  if (section === "tree" || section === "blob") {
    // A branch name may contain "/", so where it ends is only known once the repo's
    // branches are listed. subdir assumes a one-segment branch; treePath keeps it all
    // for splitTreePath to settle.
    const segments = rest.map(decodeURIComponent)
    if (segments.includes("..")) return { error: "That path is not inside the repo." }
    const subdir = segments.slice(1).join("/")
    const treePath = segments.join("/")
    return { source: repoUrl, ...(subdir ? { subdir } : {}), ...(treePath ? { treePath } : {}), kind: "repo" }
  }

  return { source: repoUrl, kind: "repo" }
}

/** Splits a tree link's path into branch and folder, preferring the longest branch name that matches. */
export function splitTreePath(treePath: string, branches: string[]): { ref: string; subdir?: string } {
  const match = branches
    .filter((branch) => treePath === branch || treePath.startsWith(`${branch}/`))
    .sort((a, b) => b.length - a.length)[0]
  const ref = match ?? treePath.split("/")[0] ?? treePath
  const subdir = treePath.slice(ref.length + 1)
  return subdir ? { ref, subdir } : { ref }
}
