import { configPath, isConfigured } from "@/lib/server/config"

import { Park, Squiggle, Sun } from "./doodles"
import { GateForm } from "./GateForm"

export const dynamic = "force-dynamic"

export default function GatePage() {
  const configured = isConfigured()

  return (
    <div className="gate">
      <section className="gate-hero">
        <Sun className="doodle doodle-sun" />
        <h1 className="gate-title">
          Drop a repo or PR link
          <Squiggle />
        </h1>
        <p className="lede">I will read it, boot the app, and walk you through it in a short narrated video.</p>
      </section>

      {configured ? (
        <GateForm />
      ) : (
        <section className="card card-sun notice" role="status">
          <h2>The park is not open yet</h2>
          <p>Run the bootstrap first. It sets up the Axernel project and agent, then writes the config this page reads.</p>
          <p className="mono">{configPath()}</p>
        </section>
      )}

      <Park className="doodle doodle-park" />
    </div>
  )
}
