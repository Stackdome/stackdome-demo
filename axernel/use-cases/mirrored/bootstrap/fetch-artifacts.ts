// Saves a finished run's artifacts to a folder. Usage: npm run artifacts -- <runId> <outDir>
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { artifacts } from "./agent.js"
import { authenticate } from "./shared.js"

const [runId, outDir] = process.argv.slice(2)
if (!runId || !outDir) throw new Error("usage: npm run artifacts -- <runId> <outDir>")
const axernel = await authenticate()
const run = await axernel.runs.get(runId)
mkdirSync(outDir, { recursive: true })
for (const output of run.artifactOutputs ?? []) {
  if (output.status !== "available" || !output.artifactId) {
    console.log(`${output.name}: ${output.status}`)
    continue
  }
  const bytes = await axernel.artifacts.download(output.artifactId, { timeoutMs: 120_000 })
  const fileName = artifacts.find((a) => a.name === output.name)?.fileName ?? output.name
  writeFileSync(join(outDir, fileName), bytes)
  console.log(`${fileName}: ${bytes.length} bytes`)
}
