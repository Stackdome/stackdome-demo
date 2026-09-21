import { authenticate } from "./shared.js"
const run = await (await authenticate()).runs.get(process.argv[2]) as Record<string, any>
console.log(new Date().toISOString(), JSON.stringify({ status: run.status, finishedAt: run.finishedAt, deadlineAt: run.deadlineAt, termination: run.terminationReason, error: run.error, cost: run.usage?.costUsd, tokens: run.usage?.totalTokens, score: run.response?.value?.matchScore, passes: run.response?.value?.passes, caveats: run.response?.value?.caveats, artifacts: (run.artifactOutputs||[]).map((a:any)=>a.name+':'+a.status) }, null, 1))
