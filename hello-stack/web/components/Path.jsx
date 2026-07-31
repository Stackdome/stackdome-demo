'use client';

/* web → redis → worker. every lit segment is a real stage event. */
export default function Path({ lit, worker, offline }) {
  return (
    <p className={'path' + (offline ? ' offline' : '')} aria-hidden="true">
      <i className={lit.p0 ? 'on' : ''}>web</i>
      <span className={'arw' + (lit.a0 ? ' on' : '')}>&#8594;</span>
      <i className={lit.p1 ? 'on' : ''}>redis</i>
      <span className={'arw' + (lit.a1 ? ' on' : '')}>&#8594;</span>
      <i className={lit.p2 ? 'on' : ''}><span id="who">{worker}</span></i>
    </p>
  );
}
