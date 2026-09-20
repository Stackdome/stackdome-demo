// Argo's in-process Kokoro init crashes (onnx bad_alloc) on this machine, while
// standalone kokoro-js works. Pre-generate clips into Argo's content-addressed
// cache so `argo tts/pipeline` sees full cache hits and never inits the engine.
// Usage: node pregen-tts.mjs <demoName>
import { KokoroTTS } from 'kokoro-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const demo = process.argv[2];
if (!demo) throw new Error('usage: node pregen-tts.mjs <demoName>');

const root = path.dirname(new URL(import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'demos', `${demo}.scenes.json`), 'utf8'));
const clipsDir = path.join(root, '.argo', demo, 'clips');
fs.mkdirSync(clipsDir, { recursive: true });

// mirror ClipCache.computeHash after cli.js folds config defaults into the entry
// (defaultVoice 'af_heart', defaultSpeed 1.0); lang stays undefined → dropped
const hashOf = (e) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify({ scene: e.scene, text: e.text, voice: e.voice ?? 'af_heart', speed: e.speed ?? 1.0, lang: e.lang })
    )
    .digest('hex');

// IEEE float32 mono WAV — must match argo's createWavBuffer (audioFormat=3),
// its aligner reinterprets clip data as Float32; int16 clips decode to NaN garbage
function toWav(float32, sampleRate) {
  const dataSize = float32.length * 4;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20);        // IEEE float
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  Buffer.from(float32.buffer, float32.byteOffset, dataSize).copy(buf, 44);
  return buf;
}

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
console.log('model loaded');

for (const e of manifest) {
  if (!e.text?.trim()) continue;
  const out = path.join(clipsDir, `${hashOf(e)}.wav`);
  if (fs.existsSync(out)) {
    console.log(`cached  ${e.scene}`);
    continue;
  }
  process.stdout.write(`gen     ${e.scene} ...`);
  const audio = await tts.generate(e.text, { voice: e.voice ?? 'af_heart', speed: e.speed ?? 1.0 });
  fs.writeFileSync(out, toWav(audio.audio, audio.sampling_rate));
  console.log(` ${Math.round(audio.audio.length / audio.sampling_rate)}s`);
}
console.log('all clips cached for', demo);
