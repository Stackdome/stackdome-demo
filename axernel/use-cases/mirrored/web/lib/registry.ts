// The shadcn registry a mirror serves under /r/<mirrorId>/. Calculations only:
// which file names may be served, what the index lists, what command to show.

const REGISTRY_FILE = /^[a-z0-9-]+\.json$/

/** The name as it may be read from disk, or null. Nothing with a slash, a dot-dot or a capital gets through. */
export function registryFileName(file: string): string | null {
  return REGISTRY_FILE.test(file) ? file : null
}

/** A zip entry's path -> the registry file it becomes, or null when it is not one.
 *  The agent puts them under `r/`; only the base name is kept, and it must pass the whitelist. */
export function registryFileOfEntry(entryName: string): string | null {
  return registryFileName(entryName.split("/").pop() ?? "")
}

export interface RegistryItem {
  name: string
  type: string
}

/** The items `r/index.json` lists: `{ items: [{ name, type }] }`. Written by an
 *  agent, so anything that does not fit, or could not be served, is left out. */
export function registryItems(index: unknown): RegistryItem[] {
  const items = (index as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return []
  return items.flatMap((item: unknown) => {
    const { name, type } = (item ?? {}) as { name?: unknown; type?: unknown }
    if (typeof name !== "string" || !registryFileName(`${name}.json`)) return []
    return [{ name, type: typeof type === "string" ? type : "" }]
  })
}

export const isTheme = (item: RegistryItem): boolean => item.type === "registry:theme" || item.type === "registry:style"

/** Components first, since a component is what was asked for; the theme after. */
export function byInstallOrder(items: RegistryItem[]): RegistryItem[] {
  return [...items.filter((item) => !isTheme(item)), ...items.filter(isTheme)]
}

/** The names to show an install line for: the components the result names,
 *  then whatever else the index lists, themes last. Each once, and only names the route would serve. */
export function installNames(components: unknown, items: RegistryItem[]): string[] {
  const named = Array.isArray(components) ? components.filter((name): name is string => typeof name === "string" && registryFileName(`${name}.json`) !== null) : []
  return [...new Set([...named, ...byInstallOrder(items).map((item) => item.name)])]
}

export function shadcnCommand(origin: string, mirrorId: string, name: string): string {
  return `npx shadcn@latest add ${origin.replace(/\/+$/, "")}/r/${mirrorId}/${name}.json`
}
