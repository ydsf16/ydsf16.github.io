const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const profiles = {
  car: { name: 'V8 运动跑车', type: 'V8 · SPORTS CAR', idle: 850, max: 7500, top: 210, accel: 5.4 },
  tractor: { name: '久保田 ZT140 单缸风格', type: 'SINGLE CYLINDER · DIESEL SIMULATION', idle: 800, max: 2400, top: 72, accel: 4 },
  jet: { name: '喷气战斗机', type: 'JET · TURBINE', idle: 3000, max: 11000, top: 980, accel: 11 }
};
let kind = new URLSearchParams(location.search).get('vehicle');
if (!profiles[kind]) kind = 'car';
let context, node, master, fallback, synthGain, carSamples, carIdle, tractorSample;
let carSamplesLoading = false;
let carSamplesError = false;
let tractorSampleLoading = false;
let tractorSampleError = false;
const carLoopRpms = [2977, 4438];
let audioReady = false;
let savedVolume;
try { savedVolume = localStorage.getItem('tg-sound-volume'); } catch { /* Private browsing may disable storage. */ }
let volume = clamp(savedVolume === null || savedVolume === undefined ? 55 : Number(savedVolume), 0, 100);
let gpsWatch = null, gpsFix = null, sensorSpeed = null, sensorAccel = 0, lastSensorAt = 0;
let motionAxis = null, motionSample = null, motionAcceleration = null, lastMotionAt = 0;
let manual = false, gas = 0, brake = 0, manualSpeed = 0, manualReleaseAt = 0;
let virtualRpm = profiles[kind].idle, virtualLoad = 0, gear = 1, shiftUntil = 0;
let lastFrame = performance.now(), lastMessage = 0, lastDisplay = 0;

$('volume').value = volume;
$('volume-value').textContent = volume + '%';
$('volume').addEventListener('input', () => {
  volume = Number($('volume').value);
  $('volume-value').textContent = volume + '%';
  try { localStorage.setItem('tg-sound-volume', String(volume)); } catch { /* Audio still works. */ }
  if (master && context) master.gain.setTargetAtTime(volume / 100, context.currentTime, .025);
  updateAudioStatus();
});
function status(text, waiting = false) {
  $('live').classList.toggle('waiting', waiting);
  $('live').querySelector('span').textContent = text;
}
function audioStatus(text) { $('audio-status').textContent = text; }
function configureAudioSession() {
  // On iOS, the default ambient session can be silenced by the Ring/Silent switch.
  try {
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
  } catch { /* Older browsers do not expose the Audio Session API. */ }
}
function updateAudioStatus() {
  if (!context) return;
  if (context.state !== 'running') { audioStatus('轻触载具卡片开启声音'); return; }
  if (volume === 0) { audioStatus('音量为 0'); return; }
  if (kind === 'car') {
    audioStatus(carIdle ? 'V8 真实怠速＋实时合成' : carSamplesError ? '录音加载失败，仅合成声浪' : '正在载入 V8 录音…');
  } else if (kind === 'tractor') {
    audioStatus(tractorSample ? '单缸拖拉机实录＋实时合成 · 久保田风格' : tractorSampleError ? '录音加载失败，仅合成单缸柴油声' : '正在载入单缸柴油音色包…');
  } else audioStatus('声浪实时生成中');
}
function selectVehicle(next) {
  if (!profiles[next]) return;
  kind = next;
  $('app').dataset.vehicle = kind;
  $('name').textContent = profiles[kind].name;
  $('type').textContent = profiles[kind].type;
  document.querySelectorAll('.vehicle-card').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
  const url = new URL(location.href);
  url.searchParams.set('vehicle', kind);
  history.replaceState(null, '', url);
  gear = 1;
  virtualRpm = profiles[kind].idle;
  if (node) node.port.postMessage({ kind, rpm: virtualRpm, load: virtualLoad });
  if (fallback) fallback.setKind(kind);
  updateAudioStatus();
  $('gas-label').textContent = kind === 'jet' ? '推力' : '油门';
  $('brake-label').textContent = kind === 'jet' ? '减速' : '刹车';
  $('gas').setAttribute('aria-label', '按住' + (kind === 'jet' ? '推力' : '油门'));
  $('brake').setAttribute('aria-label', '按住' + (kind === 'jet' ? '减速' : '刹车'));
}
document.querySelectorAll('.vehicle-card').forEach(button => button.addEventListener('click', () => {
  ensureAudio(true);
  selectVehicle(button.dataset.kind);
}));
selectVehicle(kind);
function buildDial(target, max, minor, major, labels) {
  const group = $(target);
  const ns = 'http://www.w3.org/2000/svg';
  for (let value = 0; value <= max; value += minor) {
    const angle = (-120 + 240 * value / max) * Math.PI / 180;
    const big = value % major === 0;
    const line = document.createElementNS(ns, 'line');
    const radius = big ? 110 : 119;
    for (const [name, r] of [['x1',radius],['x2',129]]) line.setAttribute(name, 150 + Math.sin(angle) * r);
    for (const [name, r] of [['y1',radius],['y2',129]]) line.setAttribute(name, 150 - Math.cos(angle) * r);
    line.setAttribute('class', `dial-tick${big ? '' : ' minor'}${target === 'rpm-ticks' && value >= 6500 ? ' red' : ''}`);
    group.appendChild(line);
    if (!big) continue;
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 150 + Math.sin(angle) * 91);
    text.setAttribute('y', 150 - Math.cos(angle) * 91);
    text.setAttribute('class', 'dial-number');
    text.textContent = labels(value);
    group.appendChild(text);
  }
}
buildDial('rpm-ticks', 8000, 250, 1000, value => value / 1000);
buildDial('speed-ticks', 240, 10, 40, value => value);

function makeFallback(ctx) {
  const tone = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const gain = ctx.createGain();
  const lowpass = ctx.createBiquadFilter();
  tone.type = 'sawtooth'; sub.type = 'triangle'; lowpass.type = 'lowpass';
  gain.gain.value = .14;
  tone.connect(lowpass); sub.connect(lowpass); lowpass.connect(gain); gain.connect(synthGain);
  tone.start(); sub.start();
  return {
    setKind(next) { tone.type = next === 'jet' ? 'sine' : next === 'tractor' ? 'square' : 'sawtooth'; },
    update(rpm, load, next) {
      const f = next === 'jet' ? 110 + rpm * .045 : next === 'tractor' ? rpm / 40 : rpm / 18;
      tone.frequency.setTargetAtTime(f, ctx.currentTime, .03);
      sub.frequency.setTargetAtTime(f * .5, ctx.currentTime, .03);
      lowpass.frequency.setTargetAtTime(250 + load * 2400, ctx.currentTime, .04);
      gain.gain.setTargetAtTime(.07 + load * .16, ctx.currentTime, .04);
    }
  };
}
async function loadCarSamples() {
  if (carSamples || carSamplesLoading || !context) return;
  carSamplesLoading = true;
  updateAudioStatus();
  try {
    const files = ['v8-idle.wav', ...carLoopRpms.map((_, i) => `v8-${i + 1}.wav`)];
    const [idleBuffer, ...buffers] = await Promise.all(files.map(async file => {
      const response = await fetch(`./samples/${file}`);
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return context.decodeAudioData(await response.arrayBuffer());
    }));
    const idleSource = context.createBufferSource();
    const idleGain = context.createGain();
    idleSource.buffer = idleBuffer;
    idleSource.loop = true;
    idleGain.gain.value = 0;
    idleSource.connect(idleGain).connect(master);
    idleSource.start(0, Math.random() * idleBuffer.duration);
    carIdle = { source: idleSource, gain: idleGain };
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 6500;
    lowpass.connect(master);
    carSamples = buffers.map((buffer, i) => {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = profiles.car.idle / carLoopRpms[i];
      gain.gain.value = 0;
      source.connect(gain).connect(lowpass);
      source.start(0, Math.random() * buffer.duration);
      return { source, gain };
    });
    carSamples.lowpass = lowpass;
    carSamplesError = false;
  } catch (error) {
    console.warn('V8 recordings unavailable; using synthesized sound', error);
    carSamplesError = true;
  } finally { carSamplesLoading = false; updateAudioStatus(); }
}
async function loadTractorSample() {
  if (tractorSample || tractorSampleLoading || !context) return;
  tractorSampleLoading = true;
  updateAudioStatus();
  try {
    const response = await fetch('./samples/tractor-single-cylinder-v2.wav');
    if (!response.ok) throw new Error(`tractor-single-cylinder-v2.wav: ${response.status}`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const source = context.createBufferSource();
    const gain = context.createGain();
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3200;
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0;
    source.connect(lowpass).connect(gain).connect(master);
    source.start(0, Math.random() * buffer.duration);
    tractorSample = { source, gain, lowpass };
    tractorSampleError = false;
  } catch (error) {
    console.warn('Tractor recording unavailable; using synthesized sound', error);
    tractorSampleError = true;
  } finally { tractorSampleLoading = false; updateAudioStatus(); }
}
function updateTractorSampleMix(rpm, load) {
  if (!context || !synthGain) return;
  const now = context.currentTime;
  const active = kind === 'tractor' && !!tractorSample;
  if (kind === 'tractor') synthGain.gain.setTargetAtTime(active ? .19 + .17 * clamp((rpm - 800) / 1600, 0, 1) : 1, now, .035);
  if (!tractorSample) return;
  const rev = clamp((rpm - 800) / 1600, 0, 1);
  // The excerpt's measured firing cadence is about 13 Hz, or 1560 rpm
  // for one firing per two crankshaft revolutions.
  tractorSample.source.playbackRate.setTargetAtTime(clamp(rpm / 1560, .48, 1.6), now, .025);
  tractorSample.lowpass.frequency.setTargetAtTime(2300 + 2600 * rev + 650 * load, now, .04);
  tractorSample.gain.gain.setTargetAtTime(active ? .62 - .10 * rev + .10 * load : 0, now, .045);
}
function updateCarSampleMix(rpm, load) {
  if (!context || !synthGain) return;
  const now = context.currentTime;
  const active = kind === 'car' && carSamples && carIdle;
  const blend = active ? clamp((rpm - 1450) / 1050, 0, 1) : 0;
  const smooth = blend * blend * (3 - 2 * blend);
  if (kind !== 'tractor') synthGain.gain.setTargetAtTime(active ? .32 + .62 * smooth : 1, now, .025);
  if (!carSamples) return;
  carIdle.source.playbackRate.setTargetAtTime(clamp(rpm / 1205, .6, 1.4), now, .025);
  carIdle.gain.gain.setTargetAtTime(kind === 'car' ? (1 - smooth) * (.6 + .18 * clamp(load, 0, 1)) : 0, now, .04);
  const weights = carLoopRpms.map(() => 0);
  if (rpm <= carLoopRpms[0]) weights[0] = 1;
  else if (rpm >= carLoopRpms.at(-1)) weights[weights.length - 1] = 1;
  else {
    let i = 0;
    while (rpm > carLoopRpms[i + 1]) i++;
    const x = clamp(Math.log(rpm / carLoopRpms[i]) / Math.log(carLoopRpms[i + 1] / carLoopRpms[i]), 0, 1);
    const cross = x * x * (3 - 2 * x);
    weights[i] = Math.cos(cross * Math.PI / 2);
    weights[i + 1] = Math.sin(cross * Math.PI / 2);
  }
  const loudness = .09 + .1 * clamp(load, 0, 1);
  carSamples.lowpass.frequency.setTargetAtTime(1800 + 7500 * clamp(load, 0, 1), now, .04);
  carSamples.forEach((loop, i) => {
    loop.source.playbackRate.setTargetAtTime(clamp(rpm / carLoopRpms[i], .25, 1.45), now, .018);
    loop.gain.gain.setTargetAtTime(kind === 'car' ? weights[i] * smooth * loudness : 0, now, .03);
  });
}
async function ensureAudio(fromGesture = false) {
  configureAudioSession();
  if (audioReady) {
    if (context?.state === 'suspended') context.resume().then(updateAudioStatus).catch(() => audioStatus('浏览器未允许播放声音'));
    if (fromGesture) requestMotion();
    return;
  }
  if (!context) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { audioStatus('此浏览器不支持声音合成'); return; }
    context = new Ctx({ latencyHint: 'interactive' });
    context.onstatechange = updateAudioStatus;
    master = context.createGain();
    master.gain.value = volume / 100;
    synthGain = context.createGain();
    synthGain.gain.value = 1;
    synthGain.connect(master);
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 4;
    master.connect(limiter).connect(context.destination);
  }
  // resume() and iOS motion permission must both be requested inside the tap.
  const resume = context.resume().then(updateAudioStatus).catch(() => audioStatus('浏览器未允许播放声音'));
  if (fromGesture) requestMotion();
  if (audioReady || ensureAudio.loading) return;
  ensureAudio.loading = true;
  try {
    if (!context.audioWorklet) throw new Error('no worklet');
    await context.audioWorklet.addModule('./audio-worklet.js?v=6');
    node = new AudioWorkletNode(context, 'tinygrape-vehicle-sound', { numberOfInputs: 0, outputChannelCount: [1] });
    node.connect(synthGain);
    node.port.postMessage({ kind, rpm: virtualRpm, load: virtualLoad });
    node.onprocessorerror = () => {
      node.disconnect();
      node = null;
      if (!fallback) fallback = makeFallback(context);
      fallback.setKind(kind);
      updateAudioStatus();
    };
  } catch (err) {
    fallback = makeFallback(context);
    fallback.setKind(kind);
  }
  audioReady = true;
  loadCarSamples();
  loadTractorSample();
  updateAudioStatus();
  resume.then(updateAudioStatus);
  ensureAudio.loading = false;
}
// A permitted browser may start immediately. If autoplay is blocked, any card,
// slider or manual-control touch resumes the same audio context.
ensureAudio(false);
document.addEventListener('pointerdown', () => ensureAudio(true), { passive: true });
document.addEventListener('keydown', () => ensureAudio(true));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && context?.state === 'suspended') audioStatus('轻触载具卡片开启声音');
});

function requestMotion() {
  if (requestMotion.done || requestMotion.pending) return;
  const attach = () => {
    window.addEventListener('devicemotion', onMotion);
    requestMotion.done = true;
    requestMotion.pending = false;
  };
  if (typeof DeviceMotionEvent === 'undefined') return;
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    requestMotion.pending = true;
    DeviceMotionEvent.requestPermission().then(result => {
      if (result === 'granted') attach(); else requestMotion.pending = false;
    }).catch(() => { requestMotion.pending = false; });
  } else attach();
}
function onMotion(event) {
  const m = event.acceleration;
  if (!m || ![m.x, m.y, m.z].every(Number.isFinite)) return;
  motionSample = [m.x, m.y, m.z];
  if (motionAxis) {
    const projected = motionSample.reduce((sum, value, i) => sum + value * motionAxis[i], 0);
    motionAcceleration = clamp(projected, -7, 7);
    lastMotionAt = performance.now();
  }
}
function haversine(a, b) {
  const r = Math.PI / 180;
  const dlat = (b.latitude - a.latitude) * r, dlon = (b.longitude - a.longitude) * r;
  return 12742000 * Math.asin(Math.sqrt(Math.sin(dlat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dlon / 2) ** 2));
}
function onPosition(position) {
  const c = position.coords, t = position.timestamp;
  if (!Number.isFinite(c.accuracy) || c.accuracy > 80) { status('定位较弱', true); return; }
  let measured = Number.isFinite(c.speed) && c.speed >= 0 ? c.speed * 3.6 : null;
  if (measured === null && gpsFix) {
    const dt = (t - gpsFix.t) / 1000;
    if (dt >= .5 && dt <= 8) {
      const d = haversine(gpsFix.coords, c);
      if (d > Math.max(3, Math.min(12, (c.accuracy + gpsFix.coords.accuracy) * .3))) measured = d / dt * 3.6;
      else if (d < 3 && dt > 2) measured = 0;
    }
  }
  gpsFix = { coords: { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy }, t };
  if (measured === null) return;
  measured = clamp(measured, 0, 1000);
  if (sensorSpeed !== null) {
    const dt = (t - onPosition.previousTime) / 1000;
    if (dt > .3 && dt < 10) {
      const delta = (measured - sensorSpeed) / 3.6 / dt;
      if (Math.abs(delta) < 8) {
        sensorAccel = clamp(.55 * sensorAccel + .45 * delta, -7, 7);
        if (delta > .5 && motionSample) {
          const mag = Math.hypot(...motionSample);
          if (mag > .35 && mag < 7) {
            const axis = motionSample.map(x => x / mag);
            motionAxis = motionAxis ? motionAxis.map((v, i) => .8 * v + .2 * axis[i]) : axis;
            const norm = Math.hypot(...motionAxis);
            motionAxis = motionAxis.map(v => v / norm);
          }
        }
      }
    }
  }
  sensorSpeed = measured;
  onPosition.previousTime = t;
  lastSensorAt = performance.now();
  status(motionAxis && performance.now() - lastMotionAt < 1000 ? '速度＋运动' : '速度联动');
}
function startLocation() {
  if (!navigator.geolocation) { status('手动试音', true); return; }
  try {
    gpsWatch = navigator.geolocation.watchPosition(onPosition, err => {
      status(err.code === 1 ? '定位未授权' : '定位暂不可用', true);
      $('source').textContent = '可手动试音';
    }, { enableHighAccuracy: true, maximumAge: 500, timeout: 12000 });
  } catch { status('定位暂不可用', true); }
}
startLocation();

function bindPedal(id, setter) {
  const element = $(id);
  element.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (!manual) manualSpeed = sensorSpeed !== null && performance.now() - lastSensorAt < 5500 ? sensorSpeed : 0;
    manual = true;
    element.setPointerCapture(event.pointerId);
    setter(1);
    element.classList.add('held');
  });
  const release = () => {
    setter(0);
    element.classList.remove('held');
    if (!gas && !brake) manualReleaseAt = performance.now();
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);
}
bindPedal('gas', value => gas = value);
bindPedal('brake', value => brake = value);
window.addEventListener('blur', () => { gas = brake = 0; manualReleaseAt = performance.now(); });

function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, .08);
  lastFrame = now;
  const p = profiles[kind];
  const fresh = sensorSpeed !== null && now - lastSensorAt < 5500;
  if (manual && fresh && !gas && !brake && now - manualReleaseAt > 2500) manual = false;
  let speed = fresh ? sensorSpeed : 0;
  let accel = fresh ? sensorAccel : 0;
  if (fresh && motionAxis && now - lastMotionAt < 800) accel = clamp(.85 * motionAcceleration + .15 * sensorAccel, -7, 7);
  if (manual) {
    const targetA = gas * p.accel * (1 - manualSpeed / (p.top * 1.2)) - brake * 8 - (gas ? .1 : .8);
    manualSpeed = clamp(manualSpeed + targetA * dt * 3.6, 0, p.top);
    speed = manualSpeed;
    accel = targetA;
  }
  speed = clamp(speed, 0, 1000);
  // Vehicle dynamics receive only the normalized speed and acceleration.
  let targetRpm, targetLoad;
  if (kind === 'car') {
    const up = [0, 26, 48, 74, 108, 150];
    const down = [0, 0, 18, 37, 63, 96];
    if (gear < 6 && speed > up[gear] + 4 && now > shiftUntil) { gear++; shiftUntil = now + 260; }
    if (gear > 1 && speed < down[gear] && now > shiftUntil) { gear--; shiftUntil = now + 210; }
    const ratio = [0, 125, 87, 66, 50, 40, 34];
    targetRpm = clamp(p.idle + speed * ratio[gear], p.idle, p.max);
    if (manual && gas && speed < 3) targetRpm = Math.max(targetRpm, p.idle + 2200 * gas);
    targetLoad = clamp(.10 + Math.max(0, accel) * .27 + speed * .0012 - Math.max(0, -accel) * .18, .02, 1);
    if (now < shiftUntil) targetLoad *= .24;
  } else if (kind === 'tractor') {
    targetRpm = clamp(p.idle + speed * 24 + Math.max(0, accel) * 180, p.idle, p.max);
    if (manual && gas && speed < 2) targetRpm = Math.min(p.max, targetRpm + 750 * gas);
    targetLoad = clamp(.14 + Math.max(0, accel) * .37 + speed * .005, .1, 1);
  } else {
    targetLoad = clamp(.24 + speed / 1500 + Math.max(0, accel) * .09 - Math.max(0, -accel) * .04, .16, 1);
    targetRpm = p.idle + targetLoad * (p.max - p.idle);
  }
  const inertia = kind === 'jet' ? 1.7 : kind === 'tractor' ? 3.5 : 6;
  virtualRpm += (targetRpm - virtualRpm) * (1 - Math.exp(-inertia * dt));
  virtualLoad += (targetLoad - virtualLoad) * (1 - Math.exp(-(targetLoad > virtualLoad ? 16 : 5) * dt));
  if (kind === 'tractor' && dt > 0) {
    // Display rotation is slowed so the wheel remains visible at 60 Hz screens.
    frame.flywheelAngle = ((frame.flywheelAngle || 0) - 360 * clamp(virtualRpm / 600, 1.1, 4.2) * dt) % 360;
    $('tractor-flywheel').style.transform = `rotate(${frame.flywheelAngle}deg)`;
  }
  if (node && now - lastMessage > 25) {
    node.port.postMessage({ kind, rpm: virtualRpm, load: virtualLoad });
    updateCarSampleMix(virtualRpm, virtualLoad);
    updateTractorSampleMix(virtualRpm, virtualLoad);
    lastMessage = now;
  }
  if (fallback && now - lastMessage > 25) {
    updateCarSampleMix(virtualRpm, virtualLoad);
    updateTractorSampleMix(virtualRpm, virtualLoad);
    lastMessage = now;
  }
  if (fallback && context?.state === 'running') fallback.update(virtualRpm, virtualLoad, kind);
  if (now - lastDisplay > 100) {
    $('car-speed').textContent = Math.round(speed);
    $('car-rpm').textContent = Math.round(virtualRpm).toLocaleString('en-US');
    $('car-gear').textContent = 'D' + gear;
    $('rpm-needle').style.transform = `rotate(${-120 + 240 * clamp(virtualRpm / 8000, 0, 1)}deg)`;
    $('speed-needle').style.transform = `rotate(${-120 + 240 * clamp(speed / 240, 0, 1)}deg)`;
    $('car-load').textContent = '负载 ' + Math.round(virtualLoad * 100) + '%';
    $('tractor-rpm').textContent = Math.round(virtualRpm).toLocaleString('en-US');
    $('tractor-speed').textContent = Math.round(speed);
    $('jet-thrust').textContent = Math.round(virtualLoad * 100) + '%';
    $('jet-speed').textContent = Math.round(speed);
    $('jet-load').textContent = '负载 ' + Math.round(virtualLoad * 100) + '%';
    $('source').textContent = manual ? '模拟踏板' : fresh ? motionAxis && now - lastMotionAt < 800 ? '速度＋加速度' : '速度联动' : '等待速度数据';
    $('pedal-hint').textContent = manual ? fresh ? '松开后自动返回车速联动' : '手动模拟中 · 按住踏板' : fresh ? '按住即响应 · 松开后返回车速' : '按住踏板即可试音';
    if (!manual && !fresh && lastSensorAt) status('信号中断', true);
    if (audioReady && context?.state === 'running') updateAudioStatus();
    lastDisplay = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
