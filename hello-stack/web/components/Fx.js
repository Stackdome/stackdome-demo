/* one canvas, one rAF loop. confetti / neon beams / balloons / hearts. */

let cv = null, ctx = null;
let bits = [], beams = [], balloons = [], raf = null;

export function attach(canvas) {
  cv = canvas;
  ctx = canvas.getContext("2d");
  size();
}

export function detach() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  bits = []; beams = []; balloons = [];
  cv = null; ctx = null;
}

export function size() {
  if (!cv || !ctx) return;
  var d = devicePixelRatio || 1;
  cv.width = innerWidth * d; cv.height = innerHeight * d;
  cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
  ctx.setTransform(d, 0, 0, d, 0, 0);
}

function ensure() { if (!raf) raf = requestAnimationFrame(loop); }

var COLORS = ["#F97316", "#FB8B3C", "#BB4717", "#FDFCF9", "#34D399", "#FFD2AC"];

/* ---- confetti ---- */
export function confetti(x, y, aim, mult) {
  if (!ctx) return;
  mult = mult || 1;
  var N = Math.min(150 * mult, 520);
  for (var i = 0; i < N; i++) {
    var rib = Math.random() < .28;
    var wide = 1 + (mult - 1) * .05;
    var a = aim + (Math.random() - .5) * (rib ? .8 : 1.1) * wide, sp = ((rib ? 7 : 10) + Math.random() * 16) * (1 + (mult - 1) * .045);
    bits.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      w: rib ? 3 : 5 + Math.random() * 6, h: rib ? 15 + Math.random() * 9 : 3 + Math.random() * 5,
      rot: Math.random() * Math.PI, vr: (Math.random() - .5) * (rib ? .16 : .36),
      rib: rib, ph: Math.random() * 6.28, c: COLORS[(Math.random() * COLORS.length) | 0],
      life: 0, span: rib ? 150 : 90 + Math.random() * 60
    });
  }
  ensure();
}

/* ---- lasers ---- */
var NEON = ["#00E5FF", "#B14BFF", "#39FF88", "#FF3D9A", "#7DF9FF"];
export function lasers(x, y, aim, mult) {
  if (!ctx) return;
  mult = mult || 1;
  var NB = Math.min(16 * mult, 74), NS = Math.min(34 * mult, 170);
  for (var i = 0; i < NB; i++) {
    var a = aim + (Math.random() - .5) * 1.1;
    beams.push({
      x: x, y: y, a: a, len: 0, max: 340 + Math.random() * 620,
      sp: 34 + Math.random() * 38, w: 2 + Math.random() * 3.2,
      c: NEON[(Math.random() * NEON.length) | 0], life: 0, span: 40 + Math.random() * 24
    });
  }
  for (var j = 0; j < NS; j++) {
    var b = aim + (Math.random() - .5) * 1.4, sp2 = 7 + Math.random() * 22;
    bits.push({
      x: x, y: y, vx: Math.cos(b) * sp2, vy: Math.sin(b) * sp2, w: 2.4, h: 2.4, rot: 0, vr: 0,
      rib: false, glow: true, ph: 0, c: NEON[(Math.random() * NEON.length) | 0], life: 0, span: 34 + Math.random() * 28
    });
  }
  ensure();
}

/* ---- flying kisses ---- */
var HC = ["#FF6FA5", "#FF3D9A", "#FFA1C4", "#F97316", "#FFD2AC"];
function heartPath(c, s2) {
  c.beginPath();
  c.moveTo(0, s2 * .36);
  c.bezierCurveTo(-s2, -s2 * .36, -s2 * .38, -s2, 0, -s2 * .32);
  c.bezierCurveTo(s2 * .38, -s2, s2, -s2 * .36, 0, s2 * .36);
  c.closePath(); c.fill();
}
export function kisses(x, y, mult) {
  if (!ctx) return;
  mult = mult || 1;
  var N = Math.min(14 * mult, 96);
  for (var i = 0; i < N; i++) {
    bits.push({
      x: x, y: y, vx: (.6 + Math.random() * 2.1) * (1 + (mult - 1) * .04), vy: -(1.1 + Math.random() * 2.2) * (1 + (mult - 1) * .03),
      w: 9 + Math.random() * 11, h: 0, rot: 0, vr: 0, hrt: true, ph: Math.random() * 6.28,
      c: HC[(Math.random() * HC.length) | 0], life: -((Math.random() * 22) | 0), span: 120 + Math.random() * 50
    });
  }
  ensure();
}

/* ---- balloons ---- */
var BC = ["#F97316", "#34D399", "#FDFCF9", "#FB8B3C", "#E4B363", "#7DD3FC"];
export function balloonRelease(x, y, mult) {
  if (!ctx) return;
  mult = mult || 1;
  var N = Math.min(16 * mult, 68);
  for (var i = 0; i < N; i++) {
    balloons.push({
      x: x + (Math.random() - .5) * (90 + mult * 14), y: y + Math.random() * 70,
      r: 16 + Math.random() * 13, vy: -(1.5 + Math.random() * 2.1),
      ph: Math.random() * 6.28, amp: 14 + Math.random() * 22,
      c: BC[(Math.random() * BC.length) | 0], life: 0, spin: (Math.random() - .5) * .02
    });
  }
  ensure();
}

function loop() {
  if (!ctx) { raf = null; return; }
  ctx.clearRect(0, 0, cv.width, cv.height);

  /* beams (additive, neon) */
  if (beams.length) {
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var k = beams.length - 1; k >= 0; k--) {
      var b = beams[k]; b.life++; b.len = Math.min(b.max, b.len + b.sp);
      var t = b.life / b.span;
      if (t >= 1) { beams.splice(k, 1); continue; }
      var tail = Math.max(0, b.len - 170);
      var x1 = b.x + Math.cos(b.a) * tail, y1 = b.y + Math.sin(b.a) * tail;
      var x2 = b.x + Math.cos(b.a) * b.len, y2 = b.y + Math.sin(b.a) * b.len;
      var g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, b.c);
      var fade = 1 - t;
      ctx.strokeStyle = g;
      ctx.globalAlpha = fade * .22; ctx.lineWidth = b.w * 6;                    /* outer bloom */
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = fade * .75; ctx.lineWidth = b.w * 2.2;                  /* body */
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = fade * .95; ctx.lineWidth = Math.max(1, b.w * .55);      /* white core */
      ctx.strokeStyle = "#FFFFFF";
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = fade; ctx.fillStyle = b.c;                          /* head */
      ctx.beginPath(); ctx.arc(x2, y2, b.w * 2.2, 0, 6.29); ctx.fill();
      ctx.fillStyle = "#FFFFFF"; ctx.globalAlpha = fade * .9;
      ctx.beginPath(); ctx.arc(x2, y2, b.w * .8, 0, 6.29); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }

  /* balloons */
  for (var m = balloons.length - 1; m >= 0; m--) {
    var o = balloons[m]; o.life++;
    o.y += o.vy; o.vy *= .998;
    var wob = Math.sin(o.life * .026 + o.ph) * o.amp;
    var bx = o.x + wob, by = o.y;
    if (by < -120) { balloons.splice(m, 1); continue; }
    ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(o.life * .026 + o.ph) * .16);
    ctx.strokeStyle = "rgba(198,207,218,.42)"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(0, o.r * 1.15);
    ctx.quadraticCurveTo(o.r * .5, o.r * 1.9, 0, o.r * 2.7);
    ctx.quadraticCurveTo(-o.r * .5, o.r * 3.4, o.r * .2, o.r * 4); ctx.stroke();
    ctx.fillStyle = o.c;
    ctx.beginPath(); ctx.ellipse(0, 0, o.r * .86, o.r, 0, 0, 6.29); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, o.r * .95); ctx.lineTo(4, o.r * .95); ctx.lineTo(0, o.r * 1.2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = .4; ctx.fillStyle = "#FFFFFF";
    ctx.beginPath(); ctx.ellipse(-o.r * .3, -o.r * .35, o.r * .16, o.r * .24, -.4, 0, 6.29); ctx.fill();
    ctx.restore();
  }

  /* confetti + sparks */
  for (var i = bits.length - 1; i >= 0; i--) {
    var p = bits[i]; p.life++;
    if (p.life < 0) continue;                       /* staggered release */
    if (p.hrt) {
      p.vy *= .994;
      p.x += p.vx + Math.sin(p.life * .06 + p.ph) * 1.4;
      p.y += p.vy;
      p.rot = Math.sin(p.life * .05 + p.ph) * .3;
    } else {
      if (p.glow) { p.vx *= .94; p.vy *= .94; }
      else { p.vy += p.rib ? .13 : .33; p.vx *= p.rib ? .97 : .986; p.vy *= p.rib ? .97 : .992; }
      p.x += p.vx + (p.rib ? Math.sin(p.life * .09 + p.ph) * 1.5 : 0);
      p.y += p.vy; p.rot += p.vr;
    }
    var tt = p.life / p.span;
    if (tt >= 1 || p.y > innerHeight + 90) { bits.splice(i, 1); continue; }
    ctx.save(); ctx.globalAlpha = tt > .72 ? 1 - (tt - .72) / .28 : 1;
    ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
    if (p.hrt) {
      var grow = Math.min(1, p.life / 9);
      ctx.scale(grow * (1 + Math.sin(p.life * .11 + p.ph) * .07), grow);
      heartPath(ctx, p.w);
    }
    else if (p.glow) { ctx.globalCompositeOperation = "lighter"; ctx.beginPath(); ctx.arc(0, 0, p.w, 0, 6.29); ctx.fill(); }
    else {
      if (p.rib) ctx.scale(1, Math.cos(p.life * .11 + p.ph) * .5 + .6);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }

  if (bits.length || beams.length || balloons.length) { raf = requestAnimationFrame(loop); }
  else { raf = null; ctx.clearRect(0, 0, cv.width, cv.height); }
}
