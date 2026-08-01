'use client';

import { useState } from 'react';

export default function Tabs({ config }) {
  const [tab, setTab] = useState(null);
  const toggle = (n) => setTab((t) => (t === n ? null : n));

  return (
    <div className="tabs">
      <div className="strip">
        <button className={tab === 0 ? 'sel' : ''} onClick={() => toggle(0)}
                aria-expanded={tab === 0} aria-controls="panel-what">what just happened</button>
        <button className={tab === 1 ? 'sel' : ''} onClick={() => toggle(1)}
                aria-expanded={tab === 1} aria-controls="panel-tweaks">tweaks</button>
      </div>

      <div id="panel-what" className={'panel' + (tab === 0 ? ' sel' : '')}>
        <p>Three containers went up and found each other. <b>web</b> serves this page, <b>redis</b> holds the queue, and <b>worker</b> waits behind it for something to do.</p>
        <p>The celebration only fires once the worker reports back. So if you saw it, all three are talking and your stack is wired correctly.</p>
      </div>

      <div id="panel-tweaks" className={'panel' + (tab === 1 ? ' sel' : '')}>
        <p>Everything on this page is read from environment variables. Edit <b>.env</b> before you deploy, or change them on the stack and redeploy.</p>
        {/* options sit above their key, so no line is long enough to scroll */}
        <pre className="env"><span className="c"># .env</span>{'\n'}
          <span className="c"># confetti | lasers | balloons | kisses</span>{'\n'}
          <span className="k">CELEBRATION</span>={config.celebration}{'\n'}
          {'\n'}
          <span className="c"># party | cap | crown | beanie</span>{'\n'}
          <span className="k">HAT</span>={config.hat}{'\n'}
          {'\n'}
          <span className="k">HEADLINE</span>={config.headline}{'\n'}
          {'\n'}
          <span className="c"># optional. empty means this page&rsquo;s own address</span>{'\n'}
          <span className="k">PUBLIC_URL</span>={config.publicUrl}</pre>
      </div>
    </div>
  );
}
