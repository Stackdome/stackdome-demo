/** Branch names of a public repo; empty when GitHub cannot be asked, which leaves the one-segment guess. */
export async function listBranches(repoUrl: string): Promise<string[]> {
  const repo = new URL(repoUrl).pathname.slice(1)
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return []
    return ((await response.json()) as { name: string }[]).map((branch) => branch.name)
  } catch {
    return []
  }
}
