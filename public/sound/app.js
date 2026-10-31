const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const profiles = {
  car: { name: 'V8 运动跑车', type: 'V8 · SPORTS CAR', idle: 850, max: 7500, top: 210, accel: 5.4 },
  tractor: { name: '手扶拖拉机', type: 'SINGLE CYLINDER · DIESEL', idle: 720, max: 2200, top: 42, accel: 1.8 },
  jet: { name: '喷气战斗机', type: 'JET · TURBINE', idle: 3000, max: 11000, top: 980, accel: 11 }
};
let kind = new URLSearchParams(location.search).get('vehicle');
if (!profiles[kind]) kind = 'car';
let context, node, master, fallback;
let audioReady = false;
let savedVolume;
try { savedVolume = localStorage.getItem('tg-sound-volume'); } catch { /* Private browsing may disable storage. */ }
let volume = clamp(savedVolume === null || savedVolume === undefined ? 55 : Number(savedVolume), 0, 100);
let gpsWatch = null, gpsFix = null, sensorSpeed = null, sensorAccel = 0, lastSensorAt = 0;
let motionAxis = null, motionSample = null, motionAcceleration = null, lastMotionAt = 0;
let manual = false, gas = 0, brake = 0, manualSpeed = 0;
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
  audioStatus(context.state === 'running' ? volume === 0 ? '音量为 0' : '声浪实时生成中' : '轻触载具卡片开启声音');
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
}
document.querySelectorAll('.vehicle-card').forEach(button => button.addEventListener('click', () => {
  ensureAudio(true);
  selectVehicle(button.dataset.kind);
}));
selectVehicle(kind);

function makeFallback(ctx) {
  const tone = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const gain = ctx.createGain();
  const lowpass = ctx.createBiquadFilter();
  tone.type = 'sawtooth'; sub.type = 'triangle'; lowpass.type = 'lowpass';
  gain.gain.value = .14;
  tone.connect(lowpass); sub.connect(lowpass); lowpass.connect(gain); gain.connect(master);
  tone.start(); sub.start();
  return {
    setKind(next) { tone.type = next === 'jet' ? 'sine' : next === 'tractor' ? 'square' : 'sawtooth'; },
    update(rpm, load, next) {
      const f = next === 'jet' ? 110 + rpm * .045 : next === 'tractor' ? rpm / 25 : rpm / 18;
      tone.frequency.setTargetAtTime(f, ctx.currentTime, .03);
      sub.frequency.setTargetAtTime(f * .5, ctx.currentTime, .03);
      lowpass.frequency.setTargetAtTime(250 + load * 2400, ctx.currentTime, .04);
      gain.gain.setTargetAtTime(.07 + load * .16, ctx.currentTime, .04);
    }
  };
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
    await context.audioWorklet.addModule('./audio-worklet.js');
    node = new AudioWorkletNode(context, 'tinygrape-vehicle-sound', { numberOfInputs: 0, outputChannelCount: [1] });
    node.connect(master);
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

$('manual-toggle').addEventListener('click', () => {
  manual = !manual;
  $('manual-toggle').setAttribute('aria-pressed', String(manual));
  $('manual-panel').hidden = !manual;
  if (manual) { manualSpeed = sensorSpeed ?? 0; $('source').textContent = '手动试音'; }
  else { gas = brake = 0; }
});
function bindPedal(id, setter) {
  const element = $(id);
  element.addEventListener('pointerdown', event => {
    event.preventDefault(); element.setPointerCapture(event.pointerId); setter(1); element.classList.add('held');
  });
  const release = () => { setter(0); element.classList.remove('held'); };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);
}
bindPedal('gas', value => gas = value);
bindPedal('brake', value => brake = value);
window.addEventListener('blur', () => { gas = brake = 0; });

function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, .08);
  lastFrame = now;
  const p = profiles[kind];
  const fresh = sensorSpeed !== null && now - lastSensorAt < 5500;
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
    targetRpm = clamp(p.idle + speed * 29 + Math.max(0, accel) * 150, p.idle, p.max);
    if (manual && gas && speed < 2) targetRpm += 600 * gas;
    targetLoad = clamp(.14 + Math.max(0, accel) * .37 + speed * .005, .1, 1);
  } else {
    targetLoad = clamp(.24 + speed / 1500 + Math.max(0, accel) * .09 - Math.max(0, -accel) * .04, .16, 1);
    targetRpm = p.idle + targetLoad * (p.max - p.idle);
  }
  const inertia = kind === 'jet' ? 1.7 : kind === 'tractor' ? 3.5 : 6;
  virtualRpm += (targetRpm - virtualRpm) * (1 - Math.exp(-inertia * dt));
  virtualLoad += (targetLoad - virtualLoad) * (1 - Math.exp(-(targetLoad > virtualLoad ? 16 : 5) * dt));
  if (node && now - lastMessage > 25) {
    node.port.postMessage({ kind, rpm: virtualRpm, load: virtualLoad });
    lastMessage = now;
  }
  if (fallback && context?.state === 'running') fallback.update(virtualRpm, virtualLoad, kind);
  if (now - lastDisplay > 100) {
    $('car-speed').textContent = Math.round(speed);
    $('car-rpm').textContent = Math.round(virtualRpm).toLocaleString('en-US');
    $('car-gear').textContent = 'D' + gear + ' · 虚拟挡位';
    $('car-load').textContent = '负载 ' + Math.round(virtualLoad * 100) + '%';
    $('tractor-rpm').textContent = Math.round(virtualRpm).toLocaleString('en-US');
    $('tractor-speed').textContent = Math.round(speed);
    $('jet-thrust').textContent = Math.round(virtualLoad * 100) + '%';
    $('jet-speed').textContent = Math.round(speed);
    $('jet-load').textContent = '负载 ' + Math.round(virtualLoad * 100) + '%';
    $('source').textContent = manual ? '手动试音' : fresh ? motionAxis && now - lastMotionAt < 800 ? '速度＋加速度' : '速度联动' : '等待速度数据';
    if (!manual && !fresh && lastSensorAt) status('信号中断', true);
    if (audioReady && context?.state === 'running') updateAudioStatus();
    lastDisplay = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
