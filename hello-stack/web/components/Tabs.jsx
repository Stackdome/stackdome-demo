'use client';

import { useState } from 'react';

export default function Tabs({ config }) {
  const [tab, setTab] = useState(0);

  return (
    <div className="tabs">
      <div className="strip">
        <button className={tab === 0 ? 'sel' : ''} onClick={() => setTab(0)}>what just happened</button>
        <button className={tab === 1 ? 'sel' : ''} onClick={() => setTab(1)}>tweaks</button>
      </div>

      <div className={'panel' + (tab === 0 ? ' sel' : '')}>
        <p>Three containers. <b>web</b> serve page. <b>redis</b> hold queue. <b>worker</b> have no url — worker watch queue, worker do job.</p>
        <p>Pressing Celebrate runs no animation by itself. The button writes a job to redis, the worker grabs it, and every open browser sees the result. No job, no party.</p>
      </div>

      <div className={'panel' + (tab === 1 ? ' sel' : '')}>
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
          <span className="c"># optional — empty means this page&rsquo;s own address</span>{'\n'}
          <span className="k">PUBLIC_URL</span>={config.publicUrl}</pre>
        <ul className="steps">
          <li>Both containers read these at startup, so a redeploy is what applies them.</li>
          <li>Run <b>docker compose up -d --scale worker=3</b> and every job is claimed by a different worker.</li>
          <li>Delete the worker container and press Celebrate — the jobs wait in redis until it comes back.</li>
        </ul>
      </div>
    </div>
  );
}
