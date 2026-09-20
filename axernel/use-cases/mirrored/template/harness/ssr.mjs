// Renders /tmp-style <workDir>/registry/preview.tsx to static HTML on stdout. Run with tsx.
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

const preview = await import(`${process.argv[2]}/registry/preview.tsx`)
if (typeof preview.default !== "function") throw new Error("registry/preview.tsx must default-export a component")
process.stdout.write(renderToStaticMarkup(createElement(preview.default)))
