import { configPath, isConfigured } from "@/lib/server/config"

import { GateForm } from "./GateForm"
import { MirrorPoster } from "./shapes"

export const dynamic = "force-dynamic"

/** One poster in two halves: what to do on the left, the motif on the right. */
export default function GatePage() {
  const configured = isConfigured()

  return (
    <div className="poster">
      <section className="poster-ask">
        <h1 className="poster-title">
          <span className="heavy">Paste</span>
          <span className="heavy">a URL.</span>
          <span className="light">get the code.</span>
        </h1>

        {configured ? (
          <GateForm />
        ) : (
          <div className="notice" role="status">
            <h2>Not set up yet</h2>
            <p>Run the bootstrap first. It sets up the Axernel project and agent, then writes the config this page reads.</p>
            <p className="mono">{configPath()}</p>
          </div>
        )}
      </section>

      <div className="poster-art">
        <MirrorPoster />
      </div>
    </div>
  )
}
