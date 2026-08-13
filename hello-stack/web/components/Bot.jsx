'use client';

import { forwardRef } from 'react';

/* a five-point star, written out so the wizard hat can carry a few */
function star(cx, cy, r) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r * .45 : r;
    p.push(`${(cx + Math.cos(a) * d).toFixed(1)} ${(cy + Math.sin(a) * d).toFixed(1)}`);
  }
  return `M${p.join(' L')} Z`;
}

/* attribute-driven: data-hat picks the hat, data-fx picks the prop + face,
   the `fire` class (added by Stage) runs the celebration animation. */
const Bot = forwardRef(function Bot({ hat, fx }, ref) {
  return (
    <div className="guy" ref={ref} data-hat={hat} data-fx={fx} aria-hidden="true">
      <div className="bob">
        <svg viewBox="0 0 190 200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="hatClip"><path d="M64 58 L108 58 L88 10 Z" /></clipPath>
            <clipPath id="popClip"><path d="M-7 2 L7 2 L15 -56 L-15 -56 Z" /></clipPath>
            <linearGradient id="crownG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F5C462" /><stop offset="1" stopColor="#D89A2C" />
            </linearGradient>
            {/* the wizard hat: felt blue, lit from the left */}
            <linearGradient id="wizG" x1="0" y1="0" x2="1" y2=".4">
              <stop offset="0" stopColor="#5BA8E8" /><stop offset=".5" stopColor="#2B7BC4" />
              <stop offset="1" stopColor="#14538F" />
            </linearGradient>
            {/* the popper: shiny pink-red, highlight running down the left */}
            <linearGradient id="popG" x1="0" y1="0" x2="1" y2=".2">
              <stop offset="0" stopColor="#FF6E9C" /><stop offset=".42" stopColor="#F4265E" />
              <stop offset="1" stopColor="#A8123E" />
            </linearGradient>
          </defs>

          <ellipse cx="92" cy="184" rx="34" ry="6.5" fill="#F97316" opacity=".15" />

          {/* antennae */}
          <g className="ant">
            <path d="M60 62 Q50 46 43 36" stroke="#2A3441" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <circle cx="42" cy="33" r="5.5" fill="#F97316" />
          </g>
          <g className="ant ant2">
            <path d="M124 62 Q134 46 141 36" stroke="#2A3441" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            <circle cx="142" cy="33" r="5.5" fill="#F97316" />
          </g>

          {/* ---- hats ---- */}
          <g className="hat hat-party" transform="rotate(9 86 58)">
            <path d="M64 58 L108 58 L88 10 Z" fill="#F97316" />
            <g clipPath="url(#hatClip)">
              <rect x="56" y="44" width="66" height="8" fill="#FDFCF9" />
              <rect x="56" y="31" width="66" height="8" fill="#34D399" />
              <rect x="56" y="19" width="66" height="7" fill="#BB4717" />
            </g>
            <path d="M64 58 L108 58" stroke="rgba(0,0,0,.2)" strokeWidth="3.5" />
            <circle cx="88" cy="11" r="7" fill="#34D399" />
            <circle cx="86" cy="9" r="2.6" fill="#7DEBC0" opacity=".8" />
          </g>

          {/* the cone slouches to the right and the brim is wider than the head */}
          <g className="hat hat-wizard" transform="rotate(4 90 56)">
            <path d="M62 54 Q66 26 86 12 Q104 0 120 6 Q110 20 105 33 Q99 45 100 54 Z" fill="url(#wizG)" />
            <path d="M62 54 Q66 28 84 14 Q90 30 84 54 Z" fill="#FFFFFF" opacity=".1" />
            <ellipse cx="84" cy="55.5" rx="42" ry="8" fill="#0F467A" />
            <ellipse cx="84" cy="53.5" rx="42" ry="8" fill="#3E90D4" />
            <ellipse cx="84" cy="53.5" rx="42" ry="8" fill="url(#wizG)" opacity=".45" />
            <g fill="#FFC93C">
              <path d={star(120, 10, 5)} />
              <path d={star(86, 26, 4.6)} />
              <path d={star(97, 43, 3.6)} />
              <path d={star(72, 44, 3.2)} />
              {/* crescents: a gold disc with a hat-blue disc bitten out of it */}
              <circle cx="94" cy="17" r="3.6" />
              <circle cx="96.2" cy="16" r="3.2" fill="#2B7BC4" />
              <circle cx="76" cy="37" r="3.2" />
              <circle cx="78" cy="36" r="2.8" fill="#2B7BC4" />
            </g>
          </g>

          <g className="hat hat-cap" transform="rotate(-4 90 56)">
            <path d="M60 58 Q60 28 90 28 Q120 28 120 58 Z" fill="#F97316" />
            <path d="M60 58 Q60 40 74 32 Q68 44 70 58 Z" fill="rgba(0,0,0,.12)" />
            <path d="M116 54 Q148 48 154 60 Q146 66 116 62 Z" fill="#BB4717" />
            <rect x="58" y="53" width="64" height="8" rx="4" fill="#BB4717" />
            <circle cx="90" cy="28" r="5" fill="#FDFCF9" />
          </g>

          <g className="hat hat-crown" transform="rotate(5 90 56)">
            <path d="M62 58 L62 30 L76 44 L90 24 L104 44 L118 30 L118 58 Z" fill="url(#crownG)" />
            <rect x="60" y="52" width="60" height="9" rx="4" fill="#C98B22" />
            <circle cx="90" cy="26" r="4.4" fill="#34D399" />
            <circle cx="63" cy="32" r="3.6" fill="#F97316" />
            <circle cx="117" cy="32" r="3.6" fill="#F97316" />
            <circle cx="76" cy="56" r="3.2" fill="#FDFCF9" opacity=".85" />
            <circle cx="104" cy="56" r="3.2" fill="#FDFCF9" opacity=".85" />
          </g>

          <g className="hat hat-beanie" transform="rotate(-6 90 56)">
            <path d="M60 56 Q60 24 90 24 Q120 24 120 56 Z" fill="#34D399" />
            <path d="M60 56 Q60 36 74 28 Q68 42 70 56 Z" fill="rgba(0,0,0,.1)" />
            <rect x="56" y="50" width="68" height="12" rx="6" fill="#FDFCF9" />
            <circle cx="90" cy="19" r="9" fill="#FDFCF9" />
            <circle cx="87" cy="16" r="3.4" fill="#E8F6EF" />
          </g>

          {/* ---- body ---- */}
          <rect x="44" y="56" width="92" height="86" rx="29" fill="#1A222E" stroke="#2A3441" strokeWidth="2" />
          <rect className="visorBase" x="58" y="86" width="62" height="26" rx="13" fill="#0A0E14" />
          <circle className="eye baseEye" cx="76" cy="99" r="5.8" fill="#F97316" />
          <circle className="eye baseEye" cx="104" cy="99" r="5.8" fill="#F97316" />

          {/* ---- left hand ---- */}
          <g transform="translate(36,124)">
            <g className="handL">
              {/* balloon bunch */}
              <g className="prop prop-bunch" transform="scale(-1,1)">
                <path d="M0 0 Q6 -22 14 -40" stroke="#8A96A6" strokeWidth="1.6" fill="none" />
                <path d="M0 0 Q-2 -26 -6 -44" stroke="#8A96A6" strokeWidth="1.6" fill="none" />
                <path d="M0 0 Q14 -20 30 -34" stroke="#8A96A6" strokeWidth="1.6" fill="none" />
                <ellipse cx="15" cy="-52" rx="13" ry="16" fill="#F97316" />
                <ellipse cx="-8" cy="-57" rx="12" ry="15" fill="#34D399" />
                <ellipse cx="33" cy="-45" rx="11" ry="14" fill="#FDFCF9" />
                <ellipse cx="11" cy="-58" rx="4" ry="5" fill="#FFD2AC" opacity=".55" />
              </g>
              {/* left blaster */}
              <g className="prop prop-blasterL">
                <g transform="rotate(-36)">
                  <rect x="-6" y="-4" width="12" height="17" rx="5" fill="#39424F" />
                  <rect x="-9" y="-32" width="18" height="30" rx="7" fill="#1A222E" stroke="#2A3441" strokeWidth="2" />
                  <rect x="-9" y="-24" width="18" height="4" rx="2" fill="#B14BFF" className="neon" color="#B14BFF" />
                  <rect x="-4.5" y="-50" width="9" height="20" rx="4.5" fill="#0A0E14" />
                  <circle cx="0" cy="-50" r="7" fill="none" stroke="#00E5FF" strokeWidth="2.5" className="neon" color="#00E5FF" />
                  <circle className="tip neon" color="#7DF9FF" cx="0" cy="-52" r="4" fill="#CFFAFF" />
                  <circle className="muzzleL" cx="0" cy="-56" r="1" fill="none" />
                </g>
              </g>
              <circle cx="0" cy="0" r="10" fill="#C6CFDA" />
            </g>
          </g>

          {/* ---- right hand ---- */}
          <g transform="translate(140,116)">
            <g className="handR">
              {/* party popper */}
              <g className="prop prop-popper">
                <g transform="rotate(42)">
                  <path d="M-7 2 L7 2 L15 -56 L-15 -56 Z" fill="url(#popG)" />
                  <g clipPath="url(#popClip)">
                    <rect x="-18" y="-20" width="36" height="8" fill="#FFE3EC" />
                    <rect x="-18" y="-36" width="36" height="8" fill="#FF9BBE" />
                    <rect x="-18" y="-50" width="36" height="7" fill="#8E0E33" />
                    {/* the shine down the left face */}
                    <path d="M-11 2 L-6 -56 L-1 -56 L-4 2 Z" fill="#FFFFFF" opacity=".22" />
                  </g>
                  <ellipse cx="0" cy="-56" rx="15" ry="5" fill="#0A0E14" />
                  <ellipse cx="0" cy="-56" rx="15" ry="5" fill="none" stroke="#FDFCF9" strokeWidth="1.6" opacity=".5" />
                  <rect x="-9" y="-2" width="18" height="11" rx="4" fill="#39424F" />
                  <path d="M0 9 Q6 20 15 21" stroke="#8A96A6" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                  <circle cx="18" cy="21" r="4" fill="none" stroke="#8A96A6" strokeWidth="2.4" />
                  <g className="flash">
                    <path d="M0 -60 L6 -76 L-1 -72 L2 -92 L-8 -74 L-3 -76 Z" fill="#FDFCF9" />
                    <path d="M12 -62 L26 -74 L16 -70 Z" fill="#FFD2AC" />
                    <path d="M-14 -62 L-28 -72 L-18 -69 Z" fill="#FFD2AC" />
                  </g>
                  <circle className="muzzle" cx="0" cy="-60" r="1" fill="none" />
                </g>
              </g>
              {/* wand: the tip is what the sparkles are fired from */}
              <g className="prop prop-wand">
                <g transform="rotate(26)">
                  <rect x="-2.2" y="-52" width="4.4" height="58" rx="2.2" fill="#6B5136" />
                  <rect x="-2.2" y="-52" width="1.6" height="58" rx=".8" fill="#8A6B49" />
                  <rect x="-3.6" y="-6" width="7.2" height="15" rx="3.4" fill="#4A3826" />
                  <circle className="tip neon" color="#FFD84D" cx="0" cy="-54" r="3.4" fill="#FFF3C4" />
                  <circle className="muzzleW" cx="0" cy="-58" r="1" fill="none" />
                </g>
              </g>
              {/* right blaster */}
              <g className="prop prop-blasterR">
                <g transform="rotate(32)">
                  <rect x="-6" y="-4" width="12" height="17" rx="5" fill="#39424F" />
                  <rect x="-9" y="-32" width="18" height="30" rx="7" fill="#1A222E" stroke="#2A3441" strokeWidth="2" />
                  <rect x="-9" y="-24" width="18" height="4" rx="2" fill="#39FF88" className="neon" color="#39FF88" />
                  <rect x="-4.5" y="-50" width="9" height="20" rx="4.5" fill="#0A0E14" />
                  <circle cx="0" cy="-50" r="7" fill="none" stroke="#FF3D9A" strokeWidth="2.5" className="neon" color="#FF3D9A" />
                  <circle className="tip neon" color="#FFB3D6" cx="0" cy="-52" r="4" fill="#FFD9EC" />
                  <circle className="muzzleR" cx="0" cy="-56" r="1" fill="none" />
                </g>
              </g>
              <circle cx="0" cy="6" r="10" fill="#C6CFDA" />
            </g>
          </g>

          {/* kiss face: eyes shut, a little blush */}
          <g className="face face-kiss">
            <path d="M66 102 Q76 92 86 102" stroke="#F97316" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M94 102 Q104 92 114 102" stroke="#F97316" strokeWidth="4" fill="none" strokeLinecap="round" />
            <ellipse className="cheek" cx="56" cy="116" rx="11" ry="8" fill="#FF6FA5" opacity=".34" />
            <ellipse className="cheek" cx="124" cy="116" rx="11" ry="8" fill="#FF6FA5" opacity=".34" />
          </g>

          {/* the puff of air that carries the kiss */}
          <g className="prop prop-puff" transform="translate(124,118)">
            <g className="puffline">
              <circle cx="6" cy="-2" r="8.5" fill="#C6CFDA" opacity=".55" />
              <circle cx="22" cy="-9" r="6" fill="#C6CFDA" opacity=".4" />
              <circle cx="35" cy="-15" r="4" fill="#C6CFDA" opacity=".26" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
});

export default Bot;
