// Procedural audio atmosphere using Web Audio API.
// No asset files needed — all sounds are synthesized.

export interface AudioAtmosphere {
  start: () => void;
  stop: () => void;
  updateParams: (params: AudioParams) => void;
  dispose: () => void;
}

export interface AudioParams {
  windSpeed: number;    // 0-100
  precipMm: number;     // 0-50
  tempC: number;
}

export function createAudioAtmosphere(): AudioAtmosphere {
  let ctx: AudioContext | null = null;
  let running = false;

  // Nodes
  let masterGain: GainNode | null = null;
  let windNode: AudioBufferSourceNode | null = null;
  let windGain: GainNode | null = null;
  let rainNode: AudioBufferSourceNode | null = null;
  let rainGain: GainNode | null = null;
  let rainFilter: BiquadFilterNode | null = null;
  let birdNode: OscillatorNode | null = null;
  let birdGain: GainNode | null = null;

  let currentParams: AudioParams = { windSpeed: 0, precipMm: 0, tempC: 15 };

  function createNoiseBuffer(duration: number): AudioBuffer {
    const sampleRate = ctx!.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx!.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function start() {
    if (running) return;
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(ctx.destination);
    running = true;

    // Wind: filtered noise loop
    const windBuf = createNoiseBuffer(4);
    windNode = ctx.createBufferSource();
    windNode.buffer = windBuf;
    windNode.loop = true;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;
    windFilter.Q.value = 1;
    windNode.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);
    windNode.start();

    // Rain: white noise with low-pass
    const rainBuf = createNoiseBuffer(2);
    rainNode = ctx.createBufferSource();
    rainNode.buffer = rainBuf;
    rainNode.loop = true;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 800;
    rainFilter.Q.value = 0.5;
    rainNode.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(masterGain);
    rainNode.start();

    // Birds: occasional chirps
    birdNode = ctx.createOscillator();
    birdGain = ctx.createGain();
    birdGain.gain.value = 0;
    birdNode.type = 'sine';
    birdNode.frequency.value = 2000;
    birdNode.connect(birdGain);
    birdGain.connect(masterGain);
    birdNode.start();

    // Schedule random bird chirps
    scheduleChirps();

    // Apply initial params
    updateParams(currentParams);
  }

  let chirpTimeout: ReturnType<typeof setTimeout> | null = null;
  function scheduleChirps() {
    if (!running || !birdNode || !birdGain || !ctx) return;
    const nextDelay = 2 + Math.random() * 6; // 2-8 seconds
    chirpTimeout = setTimeout(() => {
      if (!running || !birdNode || !birdGain || !ctx) return;
      // Quick chirp: frequency sweep + gain envelope
      const now = ctx.currentTime;
      birdNode.frequency.setValueAtTime(1200 + Math.random() * 1500, now);
      birdNode.frequency.exponentialRampToValueAtTime(800 + Math.random() * 2000, now + 0.1);
      birdGain.gain.setValueAtTime(0, now);
      birdGain.gain.linearRampToValueAtTime(0.03, now + 0.02);
      birdGain.gain.linearRampToValueAtTime(0, now + 0.15);
      scheduleChirps();
    }, nextDelay * 1000);
  }

  function updateParams(params: AudioParams) {
    currentParams = params;
    if (!ctx || !running) return;

    const now = ctx.currentTime;
    const rampTime = 1; // smooth transitions

    // Wind: volume based on wind speed
    if (windGain) {
      const windVol = Math.min(params.windSpeed / 50, 1) * 0.15;
      windGain.gain.linearRampToValueAtTime(windVol, now + rampTime);
    }

    // Rain: volume based on precipitation
    if (rainGain && rainFilter) {
      const rainVol = Math.min(params.precipMm / 5, 1) * 0.12;
      rainGain.gain.linearRampToValueAtTime(rainVol, now + rampTime);
      // Heavier rain = brighter filter
      rainFilter.frequency.linearRampToValueAtTime(300 + params.precipMm * 30, now + rampTime);
    }

    // Master gain adjusts with time-of-day feeling
    if (masterGain) {
      masterGain.gain.linearRampToValueAtTime(0.3, now + rampTime);
    }
  }

  function stop() {
    running = false;
    if (chirpTimeout) clearTimeout(chirpTimeout);
    try { windNode?.stop(); } catch {}
    try { rainNode?.stop(); } catch {}
    try { birdNode?.stop(); } catch {}
    ctx?.close();
    ctx = null;
  }

  function dispose() {
    stop();
  }

  return { start, stop, updateParams, dispose };
}
