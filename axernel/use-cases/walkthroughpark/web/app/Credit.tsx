/** The quiet line under the wordmark, and once more at the foot of the gate. */
export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`credit ${className}`.trim()}>
      powered by{" "}
      <a href="https://github.com/Stackdome/axernel" target="_blank" rel="noreferrer">
        Axernel
      </a>
    </p>
  )
}
