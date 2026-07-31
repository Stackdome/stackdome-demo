'use client';

import { useEffect, useRef, useState } from 'react';
import Bot from './Bot';
import DiscoBall from './DiscoBall';
import Path from './Path';
import Tabs from './Tabs';
import Wordmark from './Wordmark';
import * as Fx from './Fx';
import { CELEBRATIONS } from '../lib/config';

const BATCH = 10;          /* at ten queued, one job takes all ten */
const DWELL = 250;         /* minimum dwell per stage, or the path lights at once */
const SEEN_CAP = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function elapsed(ms) {
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24,
    m = Math.floor(ms / 6e4) % 60, sec = Math.floor(ms / 1e3) % 60;
  return 'live for ' + (d ? d + 'd ' + h + 'h' : h ? h + 'h ' + m + 'm' : m ? m + 'm ' + sec + 's' : sec + 's');
}

export default function Stage({ config }) {
  /* --- rendered state --- */
  const [total, setTotal] = useState(null);      /* null until the first real total arrives */
  const [redisDown, setRedisDown] = useState(false);
  const [queue, setQueueState] = useState(0);
  const [held, setHeld] = useState(0);
  const [msg, setMsg] = useState(null);
  const [worker, setWorker] = useState('worker');
  const [lit, setLit] = useState({ p0: false, p1: false, p2: false, a0: false, a1: false });
  const [net, setNet] = useState('live');        /* live | down | back */
  const [retryIn, setRetryIn] = useState(0);
  const [watching, setWatching] = useState(1);
  const [uptime, setUptime] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [discoDown, setDiscoDown] = useState(false);
  const [bumping, setBumping] = useState(false);

  /* --- dom --- */
  const guyRef = useRef(null), h1Ref = useRef(null), bignumRef = useRef(null),
    canvasRef = useRef(null), goRef = useRef(null), linkRef = useRef(null);

  /* --- logic state: refs, so callbacks never read a stale render --- */
  const clientId = useRef(null), online = useRef(true), wasDown = useRef(false),
    heldRef = useRef(0), queueRef = useRef(0), bornRef = useRef(null), reduce = useRef(false),
    buf = useRef([]), playing = useRef(false), seen = useRef(new Set()), seenOrder = useRef([]),
    idleT = useRef(null), discoT = useRef(null), msgT = useRef(null);

  const t = (fn, ms) => setTimeout(fn, ms);

  /* ---------------- small helpers ---------------- */

  function say(text, cls, ms) {
    setMsg({ text, cls });
    clearTimeout(msgT.current);
    msgT.current = setTimeout(() => setMsg(null), ms || 2200);
  }

  function buzz() {
    const guy = guyRef.current;
    if (guy) guy.classList.toggle('buzz', queueRef.current >= BATCH && !reduce.current);
  }

  /* the tally is a set of job ids, not arithmetic — a batch can consume a
     job's claimed+done while its queued event is still buffered, and a
     counter drifts where a set cannot */
  const pending = useRef(new Set());
  function queueAdd(id) { pending.current.add(id); syncQueue(); }
  function queueDrop(id) { pending.current.delete(id); syncQueue(); }
  function syncQueue() {
    queueRef.current = pending.current.size;
    setQueueState(queueRef.current);
    buzz();
  }

  function flash(key, ms) {
    setLit((l) => ({ ...l, [key]: true }));
    t(() => setLit((l) => ({ ...l, [key]: false })), ms);
  }

  function pulseCount() {
    setBumping(false);
    requestAnimationFrame(() => setBumping(true));
    t(() => setBumping(false), 420);
  }

  /* the counter only ever shows a total published by the worker */
  function commitTotal(value, someoneElse) {
    if (typeof value === 'number') {
      setTotal(value);
      pulseCount();
    }
    if (someoneElse) say('someone else just celebrated', '', 2200);
  }

  function pt(sel) {
    const guy = guyRef.current;
    if (!guy) return { x: 0, y: 0 };
    const r = guy.querySelector(sel).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function act(kind, mult) {
    mult = mult || 1;
    if (kind === 'confetti') {
      const m = pt('.muzzle');
      Fx.confetti(m.x, m.y, -Math.PI / 2 + .72, mult);
      if (mult > 1) {
        Fx.confetti(m.x, m.y, -Math.PI / 2 + .18, mult * .8);
        Fx.confetti(m.x, m.y, -Math.PI / 2 + 1.20, mult * .8);
      }
    } else if (kind === 'lasers') {
      const R = pt('.muzzleR'), L = pt('.muzzleL');
      Fx.lasers(R.x, R.y, -Math.PI / 2 + .58, mult);
      t(() => Fx.lasers(L.x, L.y, -Math.PI / 2 - .62, mult), 90);
    } else if (kind === 'balloons') {
      const h = pt('.prop-bunch');
      Fx.balloonRelease(h.x, h.y, mult);
    } else if (kind === 'kisses') {
      const k = pt('.handR');
      Fx.kisses(k.x + 14, k.y - 10, mult);
    }
  }

  function idle() {
    clearTimeout(idleT.current);
    idleT.current = setTimeout(() => {
      if (playing.current) return;
      const guy = guyRef.current;
      if (guy) guy.classList.add('peek');
      setTimeout(() => { if (!playing.current && guy) guy.classList.remove('peek'); }, 2600);
      idle();
    }, 10000);
  }

  /* ---------------- the stage protocol ---------------- */

  function isMine(ev) {
    return ev.clientId === null || ev.clientId === clientId.current;
  }

  function push(ev) {
    if (!ev || !ev.jobId || !ev.stage) return;
    const key = ev.jobId + ':' + ev.stage;          /* reconnects redeliver; fire once */
    if (seen.current.has(key)) return;
    seen.current.add(key);
    seenOrder.current.push(key);
    if (seenOrder.current.length > SEEN_CAP) seen.current.delete(seenOrder.current.shift());
    /* the waiting tally reacts to every press instantly — only the
       claimed/done playback dwells */
    if (ev.stage === 'queued') { apply(ev); return; }
    buf.current.push(ev);
    if (!playing.current) drain();
  }

  /* all three hops land in single-digit ms; play them with a floor */
  async function drain() {
    playing.current = true;
    while (buf.current.length) {
      const ev = buf.current.shift();
      const hold = apply(ev);
      await sleep(Math.max(DWELL, hold));
    }
    playing.current = false;
    const guy = guyRef.current;
    if (guy) guy.classList.remove('buzz', 'hard');
    if (queueRef.current === 0 && online.current) setWorker('worker');
    idle();
  }

  function apply(ev) {
    if (ev.stage === 'queued') {
      queueAdd(ev.jobId);
      if (isMine(ev)) {
        flash('p0', 520);
        flash('a0', 480);
        t(() => flash('p1', 520), 130);
      }
      return 0;
    }

    if (ev.stage === 'claimed') {
      const group = [ev];
      if (queueRef.current >= BATCH) {
        /* a real backlog goes in one shot in EVERY browser: all claimed jobs
           in the buffer join the burst, whoever pressed them, and the count
           and queue move by all of them at once */
        for (let i = 0; i < buf.current.length; i++) {
          const e = buf.current[i];
          if (e.stage === 'claimed') { group.push(e); buf.current.splice(i, 1); i--; }
        }
      }
      return playClaimed(group, group.some(isMine));
    }

    if (ev.stage === 'done') {
      queueDrop(ev.jobId);
      commitTotal(ev.total, !isMine(ev));
      return 0;
    }

    if (ev.stage === 'failed') {
      queueDrop(ev.jobId);
      if (isMine(ev)) say('the worker could not finish that one', 'warn', 2600);
      return 0;
    }

    return 0;
  }

  function playClaimed(group, mine) {
    const take = group.length;
    const ev = group[0];
    const kind = CELEBRATIONS.includes(ev.kind) ? ev.kind : config.celebration;
    const guy = guyRef.current;

    clearTimeout(idleT.current);
    /* the claiming pod name is on the event; the label stays generic */
    setLit((l) => ({ ...l, p2: true }));
    flash('a1', 420);
    /* everyone's job gets the full party — the subline says whose it was */
    if (guy) { guy.classList.remove('peek'); guy.classList.add('in'); }
    if (kind === 'lasers' && !reduce.current) { clearTimeout(discoT.current); setDiscoDown(true); }
    if (take > 1 && guy && !reduce.current) {
      guy.classList.add('hard');                   /* a backlog rattles harder */
      t(() => guy.classList.remove('hard'), 500);
    }

    const fireAt = take > 1 ? 1450 : 1000;
    const cycle = take > 1 ? 2400 : (kind === 'kisses' ? 1980 : 1720);

    t(() => {
      if (guy) guy.classList.add('fire');
      /* the commit is the truth and runs in every browser; only the party
         stays with whoever pressed */
      fireCommit(group, mine);
      if (take > 1) {
        const bn = bignumRef.current;
        if (bn) { bn.textContent = '+' + take; bn.classList.remove('go'); void bn.offsetWidth; bn.classList.add('go'); }
      }
      if (!reduce.current) act(kind, take);
      const h = h1Ref.current;
      if (h) { h.classList.remove('jump'); void h.offsetWidth; h.classList.add('jump'); }
      if (take > 1) {
        document.body.classList.add('shake');
        t(() => document.body.classList.remove('shake'), 520);
      }
    }, fireAt);

    t(() => { if (guy) guy.classList.remove('fire'); }, fireAt + 450);

    t(() => {
      setLit((l) => ({ ...l, p2: false }));
      /* he only ducks when there is nothing left for him — with work still
         waiting he stays up and goes straight into the next job */
      const more = queueRef.current > 0 && buf.current.some((e) => e.stage === 'claimed' && isMine(e));
      if (more) { buzz(); return; }
      if (guy) guy.classList.remove('in');
      if (kind === 'lasers') discoT.current = t(() => setDiscoDown(false), 1300);
    }, cycle);

    return cycle;
  }

  /* the totals fired with the celebration are the worker's, pulled out of the
     buffer at the moment of the burst. nothing is invented. */
  function fireCommit(group, mine) {
    let total = null;
    for (const job of group) {
      const i = buf.current.findIndex((e) => e.jobId === job.jobId && (e.stage === 'done' || e.stage === 'failed'));
      if (i < 0) continue;
      const [d] = buf.current.splice(i, 1);
      if (d.stage === 'done' && typeof d.total === 'number') total = Math.max(total === null ? 0 : total, d.total);
    }
    for (const job of group) queueDrop(job.jobId);
    if (total !== null) commitTotal(total, !mine);
  }

  /* ---------------- presses ---------------- */

  function holdPress() {
    heldRef.current++;
    setHeld(heldRef.current);
    const b = goRef.current;
    if (b) { b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); }
    say('can’t reach redis · held, will send on reconnect', 'warn', 2600);
  }

  async function sendOne() {
    try {
      const r = await fetch('/api/celebrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.current }),
      });
      if (!r.ok) throw new Error('rejected');
    } catch {
      holdPress();                                  /* a failed post is a dropped stream */
    }
  }

  function press() {
    if (!online.current) { holdPress(); return; }
    sendOne();
  }

  function drainHeld() {
    const n = heldRef.current;
    heldRef.current = 0;
    setHeld(0);
    for (let i = 0; i < n; i++) t(() => sendOne(), 200 * i);
  }

  async function resync() {
    try {
      const r = await fetch('/api/state');
      const s = await r.json();
      if (!s.ok) { setRedisDown(true); setTotal(null); return; }   /* count suppressed, page still works */
      setRedisDown(false);
      setTotal(s.total);
      if (s.born) bornRef.current = s.born;
      if (typeof s.watching === 'number') setWatching(s.watching);
    } catch {
      setRedisDown(true);
      setTotal(null);
    }
  }

  /* the async clipboard api only exists on a secure origin — and this page is
     built to be opened from someone else's machine over plain http, where it
     is undefined. fall back to the legacy path, and never claim a copy that
     did not happen. */
  async function writeClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* blocked or unfocused — try the old way */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function copy() {
    if (!publicUrl) return;
    if (await writeClipboard(publicUrl)) {
      setCopied(true);
      t(() => setCopied(false), 2000);
      return;
    }
    const l = linkRef.current;
    if (l) { l.classList.remove('deny'); void l.offsetWidth; l.classList.add('deny'); }
    setCopyFailed(true);
    t(() => setCopyFailed(false), 2600);
  }

  /* ---------------- mount ---------------- */

  useEffect(() => {
    reduce.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
    clientId.current = uuid();                      /* per tab, in memory: a second tab is a second person */

    Fx.attach(canvasRef.current);
    addEventListener('resize', Fx.size);

    let es = null, closed = false, tries = 0, tickT = null, reconnT = null;

    function connect() {
      es = new EventSource('/api/events?clientId=' + clientId.current);

      es.onopen = () => {
        tries = 0;
        clearInterval(tickT);
        clearTimeout(reconnT);
        online.current = true;
        if (wasDown.current) {
          wasDown.current = false;
          setNet('back');
          setWorker('worker');
          t(() => setNet('live'), 1500);
          resync();                                 /* the number is the truth, not the animation */
          drainHeld();
        } else {
          setNet('live');
        }
      };

      es.onmessage = (e) => {
        try { push(JSON.parse(e.data)); } catch { /* not a stage event */ }
      };

      es.addEventListener('presence', (e) => {
        try {
          const p = JSON.parse(e.data);
          if (typeof p.watching === 'number') setWatching(p.watching);
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        es.close();
        if (closed) return;
        online.current = false;
        wasDown.current = true;
        setNet('down');
        setWorker('—');
        const wait = Math.min(30, 2 * Math.pow(2, Math.min(tries, 4)));   /* 2,4,8,16,30 */
        tries++;
        let left = wait;
        setRetryIn(left);
        clearInterval(tickT);
        tickT = setInterval(() => { left--; setRetryIn(Math.max(0, left)); }, 1000);
        reconnT = setTimeout(() => { clearInterval(tickT); connect(); }, wait * 1000);
      };
    }

    connect();
    resync();
    idle();

    const upT = setInterval(() => {
      if (bornRef.current) setUptime(elapsed(Date.now() - bornRef.current));
    }, 1000);

    return () => {
      closed = true;
      if (es) es.close();
      clearInterval(tickT);
      clearTimeout(reconnT);
      clearInterval(upT);
      clearTimeout(idleT.current);
      clearTimeout(msgT.current);
      removeEventListener('resize', Fx.size);
      Fx.detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- render ---------------- */

  /* PUBLIC_URL is an override; the page's own address is the truth. Read
     after mount — window does not exist during SSR. */
  const [selfUrl, setSelfUrl] = useState('');
  useEffect(() => { setSelfUrl(window.location.origin); }, []);
  const publicUrl = config.publicUrl || selfUrl;
  const shown = publicUrl.replace(/^https?:\/\//, '');

  return (
    <>
      <DiscoBall down={discoDown} />
      <canvas id="fx" ref={canvasRef} aria-hidden="true"></canvas>

      <main>
        <div className="mark"><Wordmark /></div>

        <p className={'status' + (net === 'down' ? ' down' : net === 'back' ? ' back' : '')}>
          <span id="uptime">{uptime || 'live for 0s'}</span>
          <span className="dot-sep">&#183;</span>
          <span className="livedot"></span>
          <span id="netlabel">
            {net === 'down'
              ? 'reconnecting in ' + retryIn + 's'
              : net === 'back'
                ? 'reconnected'
                : <><b>{watching}</b> watching</>}
          </span>
        </p>

        <h1 ref={h1Ref}>{config.headline}</h1>

        <button className={'link' + (copied ? ' done' : '') + (copyFailed ? ' failed' : '')} ref={linkRef} onClick={copy}>
          <span className="u">{copied ? 'copied — now send it' : copyFailed ? 'couldn’t copy — select it by hand' : shown}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <p className="cap">Copy the link, send it over, and celebrate together.</p>

        <div className="launch">
          <div className="bay">
            <Bot ref={guyRef} hat={config.hat} fx={config.celebration} />
          </div>
          <button className="go" ref={goRef} onClick={press}>
            {config.celebration === 'kisses' ? 'Blow a kiss' : 'Celebrate'}
          </button>
        </div>

        <Path lit={lit} worker={worker} offline={net === 'down'} />

        <div className="tallywrap">
          <span className="bignum" ref={bignumRef}></span>
          <p className="tally" aria-live="polite">
            {redisDown
              ? <span className="warn">can’t reach redis</span>
              : total === null
                ? <span>&#160;</span>
                : <>
                  &#127881; <b><span className={'n' + (bumping ? ' bump' : '')}>{total.toLocaleString('en-US')}</span></b>
                  {' ' + (total === 1 ? 'celebration' : 'celebrations')}
                  {queue > 0 && <span className="qd">{' · ' + (queue > 10 ? '10+' : queue) + ' waiting'}</span>}
                  {held > 0 && <span className="warn">{' · ' + held + ' to send'}</span>}
                </>}
          </p>
          {/* the count never yields its line — passing messages get their own */}
          <p className="tally subline" aria-live="polite">
            {msg ? <span className={msg.cls}>{msg.text}</span> : <span>&#160;</span>}
          </p>
        </div>

        <Tabs config={config} />
      </main>
    </>
  );
}
