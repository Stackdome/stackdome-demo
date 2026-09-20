export type ParsedSource =
  | { source: string; subdir?: string; kind: "repo" | "pr" }
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
    // ponytail: the first segment is taken as the branch, so a branch name
    // containing "/" puts its tail into subdir. Resolving it needs the API.
    const subdir = rest.slice(1).map(decodeURIComponent).join("/")
    if (subdir.split("/").includes("..")) return { error: "That path is not inside the repo." }
    return subdir ? { source: repoUrl, subdir, kind: "repo" } : { source: repoUrl, kind: "repo" }
  }

  return { source: repoUrl, kind: "repo" }
}
