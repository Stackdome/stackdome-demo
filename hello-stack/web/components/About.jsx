/* <details> carries the open/closed state, the keyboard handling and the
   expanded semantics, so there is nothing here to make it a client component */

export default function About({ config }) {
  return (
    <details className="about">
      <summary>about</summary>
      <div className="panel">
        <p>Three containers went up and found each other. <b>web</b> serves this page, <b>redis</b> holds the queue, and <b>worker</b> waits behind it for something to do.</p>
        <p>The celebration only fires once the worker reports back. So if you saw it, all three are talking and your stack is wired correctly.</p>
        <p>Everything on this page is read from environment variables. Edit <b>.env</b> before you deploy, or change them on the stack and redeploy.</p>
        {/* options sit above their key, so no line is long enough to scroll */}
        <pre className="env"><span className="c"># .env</span>{'\n'}
          <span className="c"># confetti | lasers | balloons | kisses</span>{'\n'}
          <span className="k">CELEBRATION</span>={config.celebration}{'\n'}
          {'\n'}
          <span className="c"># party | cap | crown | beanie</span>{'\n'}
          <span className="k">HAT</span>={config.hat}{'\n'}
          {'\n'}
          <span className="k">HEADLINE</span>={config.headline}</pre>
      </div>
    </details>
  );
}
