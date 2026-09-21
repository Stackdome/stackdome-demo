# Prompt: "Built on Axernel" architecture artifact

Paste into a Claude Code session opened in the repo of a working app built on Axernel.

---

This repo is an app built on Axernel. Assess it, then publish one artifact,
"`<App>` on Axernel", that explains the architecture and sells Axernel through it.
Readers are engineers who have never seen Axernel.

Reference to match in layout and look: `<artifact URL or path to its HTML source, or "none">`
Keep its layout; replace every fact with this app's. Copy no sentence or number.

**Assess first, from code and the live Axernel (read-only, never start a run):**
every Axernel call with file:line; how resources were set up; the agent's real input,
output and artifact JSON; the template or image and its versions; the request path hop by
hop; real runs with duration, tokens, cost; lines written, counted by command; what broke.

**Then build. Pictures over prose, one screen per section, headings are claims:**

1. Hero: "`<input>` goes in. `<output>` comes out." Real screenshot, three or four hard facts.
2. Request path: one SVG, left to right, labelled arrows, Axernel's part tinted orange.
3. What we wrote, and what we did not have to: line counts against what Axernel ran.
4. An agent is a contract, not a chat: the real JSON, model, limits, MCP servers.
5. The sandbox is a Docker image you own: Dockerfile → digest → template → agent → session;
   what goes in the image versus the instructions.
6. SDK in the code: table of every call, linked to file:line at a commit SHA.
7. Run lifecycle, then the real runs table.
8. Open the same objects in the console: agent, template, a session, usage, secrets.
   Localhost links get a "local only" label and a screenshot.
9. What Axernel gave us without being asked: eight to ten points, each tied to a real event.
10. Rough edges, collapsed.

**Look:** orange `#FF6007` is the only accent and always means "Axernel's part".
Ground `#F5F4F1`, ink `#191714`, muted `#6B6760`. Fraunces headings, Geist body,
JetBrains Mono for code and numbers. Light and dark.

**Rules:** no secrets or `.env` contents; no invented numbers, quotes or customers; mark
anything unverified. Check it at desktop and phone width, then give me the link, what is
verified, what is not, and the path to the HTML source.
