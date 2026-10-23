import {
  createIcons,
  Play,
  Pause,
  RotateCcw,
  Axis3D,
  ArrowUpRight,
  Radio,
} from "lucide";
import { createViewer } from "./viewer.js";
import "./style.css";

const assets = `${import.meta.env.BASE_URL}project3/`;
const captureMode = new URLSearchParams(location.search).has("capture");
document.body.classList.toggle("capture", captureMode);
document.querySelector("#app").innerHTML = `
  <header class="header"><a class="brand" href="#" aria-label="ROB 511 portfolio">ROB<span>/</span>511</a><span class="course">Robot Kinematics & Dynamics</span><nav><a href="#film">The film</a><a href="#method">The method <i data-lucide="arrow-up-right"></i></a></nav></header>
  <main>
    <section class="performance" aria-labelledby="title">
      <div id="scene"></div>
      <div class="intro"><p class="eyebrow">PROJECT 03 <span> / </span> FORWARD KINEMATICS</p><h1 id="title">ENTER THE<br><span>ROBOT.</span></h1><p class="dek">A little swagger.<br>A precise finish.</p><p class="description">A Bruce Lee-inspired robot choreography.<br>Nine moving joints. One continuous chain of transforms.</p></div>
      <div class="scene-tools"><button id="axes" class="icon-button" title="Show joint frames" aria-label="Show joint frames" aria-pressed="false"><i data-lucide="axis-3d"></i></button><button id="reset" class="icon-button" title="Reset camera" aria-label="Reset camera"><i data-lucide="rotate-ccw"></i></button></div>
      <div class="state-display"><span class="state-index" id="state-index"></span><strong id="state-label">Ready</strong><span class="source"><span class="dot"></span><span id="source-label">RECORDED RUST OUTPUT</span></span></div>
      <div class="capture-caption"><span>ENTER THE ROBOT</span><span>ROB 511 / PROJECT 03</span></div>
      <div class="transport"><button id="play" class="icon-button solid" title="Pause" aria-label="Pause"><i data-lucide="pause"></i></button><button id="replay" class="icon-button" title="Replay" aria-label="Replay"><i data-lucide="rotate-ccw"></i></button><time id="time">00:00</time><input id="timeline" aria-label="Playback time" type="range" min="0" max="30" step="0.01" value="0"><time id="duration">00:00</time><select id="speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option></select><button id="live" class="live-button" hidden><i data-lucide="radio"></i><span>Live</span></button></div>
      <p id="error" role="alert" hidden></p>
    </section>
    <div class="project-strip"><span>A STUDY IN TIMING</span><span>URDF → JOINT STATES → WORLD TRANSFORMS</span><a href="#film">Watch the film <i data-lucide="arrow-up-right"></i></a></div>
    <section id="film" class="content film-section"><div class="section-heading"><p class="eyebrow">01 / THE PERFORMANCE</p><h2>A challenge.<br>Then restraint.</h2><p>An opening bow, a whole-hand beckon, and two alternating strikes. The yellow-and-black robot channels Bruce Lee’s screen presence, then slows down for a short-punch finale and a closing bow.</p></div><figure class="film"><video controls playsinline preload="metadata" poster="${assets}poster.jpg"><source src="${assets}enter-the-robot.mp4" type="video/mp4"></video><figcaption><span>Enter the Robot · Complete FSM performance</span><a href="${assets}enter-the-robot.mp4" download>Download film <i data-lucide="arrow-up-right"></i></a></figcaption></figure></section>
    <section id="score" class="score-section"><div class="content"><div class="score-title"><p class="eyebrow">02 / THE MOVEMENT SCORE</p><h2>Prepare. Commit. Return.</h2><p>Every transition starts with arrival, not a timer alone.</p></div><div id="score-list" class="score-list"></div></div></section>
    <section id="method" class="content method-section"><div><p class="eyebrow">03 / UNDER THE SURFACE</p><h2>The motion is simple.<br>The chain is complete.</h2><p class="method-lead">A custom URDF robot with nine actuated joints. An explicit finite-state machine. A Rust runtime computing every link’s pose.</p></div><div class="method-details"><article><span>01</span><div><h3>Choose a pose</h3><p>The FSM sends joint-space targets. A speed-limited proportional servo approaches them, with a faster setting for the punch. Each state waits for measured arrival and a short hold.</p></div></article><article><span>02</span><div><h3>Compose the chain</h3><p>The runtime combines each joint’s origin and motion using unit quaternions, publishes /tf, then walks the tree to produce /xform_world. The feet stay planted; no balance or contact physics is simulated.</p><code>T<sub>world,child</sub> = T<sub>world,parent</sub> · T<sub>origin</sub> · T<sub>motion</sub></code></div></article><article><span>03</span><div><h3>Draw what the runtime says</h3><p>Three.js places each link from the captured world matrix. Playback interpolates between recorded samples for display. The robot poses come from the Rust pipeline, not browser-side inverse kinematics.</p></div></article></div></section>
    <section class="downloads content"><p class="eyebrow">EXPLORE THE BUILD</p><a href="${assets}robot.urdf" download>Robot description <span>URDF <i data-lucide="arrow-up-right"></i></span></a><a href="${assets}choreography.json" download>Movement score <span>JSON <i data-lucide="arrow-up-right"></i></span></a><a href="${assets}recording.json" download>Captured runtime output <span>JSON <i data-lucide="arrow-up-right"></i></span></a></section>
  </main><footer><a class="brand" href="#">ROB<span>/</span>511</a><p>Project 03 · Forward Kinematics</p><p>Original robot & choreography. A stylized tribute to Bruce Lee.</p></footer>`;

const icons = {
  Play,
  Pause,
  RotateCcw,
  Axis3d: Axis3D,
  ArrowUpRight,
  Radio,
};
const iconify = () => createIcons({ icons, attrs: { "stroke-width": 1.7 } });
iconify();
const $ = (selector) => document.querySelector(selector);
const clock = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

async function load(url, text = false) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Unable to load ${url} (${response.status})`);
  return text ? response.text() : response.json();
}

try {
  const [urdf, recording, choreography] = await Promise.all([
    load(assets + "robot.urdf", true),
    load(assets + "recording.json"),
    load(assets + "choreography.json"),
  ]);
  const viewer = createViewer($("#scene"), urdf);
  const states = choreography.states;
  const frames = recording.frames;
  let t = 0,
    playing =
      !captureMode && !matchMedia("(prefers-reduced-motion: reduce)").matches,
    speed = 1,
    axes = false,
    live = null;
  let currentState = "";
  $("#timeline").max = recording.duration;
  $("#duration").textContent = clock(recording.duration);
  $("#score-list").innerHTML = states
    .map(
      (state, i) =>
        `<button class="score-step" data-state="${state.name}"><span>${String(i + 1).padStart(2, "0")}</span><strong>${state.label}</strong><i data-lucide="arrow-up-right"></i></button>`,
    )
    .join("");
  iconify();
  function updateState(name) {
    if (name === currentState) return;
    currentState = name;
    const index = states.findIndex((s) => s.name === name);
    $("#state-index").textContent =
      `${String(index + 1).padStart(2, "0")} / ${String(states.length).padStart(2, "0")}`;
    $("#state-label").textContent = states[index].label;
    document
      .querySelectorAll(".score-step")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.state === name),
      );
  }
  function seek(time) {
    t = Math.max(0, Math.min(recording.duration, time));
    let lo = 0,
      hi = frames.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (frames[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    const a = frames[lo],
      b = frames[Math.min(lo + 1, frames.length - 1)];
    const alpha =
      b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    viewer.apply(a, b, alpha);
    updateState(a.state);
    $("#timeline").value = t;
    $("#time").textContent = clock(t);
  }
  function updatePlay() {
    $("#play").innerHTML =
      `<i data-lucide="${playing ? "pause" : "play"}"></i>`;
    $("#play").setAttribute("aria-label", playing ? "Pause" : "Play");
    $("#play").title = playing ? "Pause" : "Play";
    iconify();
  }
  $("#play").onclick = () => {
    if (t >= recording.duration) seek(0);
    playing = !playing;
    updatePlay();
  };
  $("#replay").onclick = () => {
    seek(0);
    playing = true;
    updatePlay();
  };
  $("#timeline").oninput = (e) => {
    playing = false;
    seek(Number(e.target.value));
    updatePlay();
  };
  $("#speed").onchange = (e) => {
    speed = Number(e.target.value);
  };
  $("#axes").onclick = () => {
    axes = !axes;
    viewer.showAxes(axes);
    $("#axes").setAttribute("aria-pressed", String(axes));
  };
  $("#reset").onclick = () => viewer.reset();
  document.querySelectorAll(".score-step").forEach((button) => {
    button.onclick = () => {
      const event = recording.events.find(
        (e) => e.state === button.dataset.state,
      );
      seek(event.t + 0.12);
      playing = false;
      updatePlay();
      $(".performance").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    };
  });
  const local = ["127.0.0.1", "localhost"].includes(location.hostname);
  $("#live").hidden = !local || captureMode;
  $("#live").onclick = () => {
    if (live) {
      live.close();
      live = null;
      $("#source-label").textContent = "RECORDED RUST OUTPUT";
      $("#live").classList.remove("active");
      for (const selector of ["#play", "#replay", "#timeline", "#speed"])
        $(selector).disabled = false;
      seek(t);
      return;
    }
    playing = false;
    updatePlay();
    live = new EventSource("http://127.0.0.1:9097/events");
    $("#source-label").textContent = "CONNECTING";
    live.onmessage = (e) => {
      const frame = JSON.parse(e.data);
      viewer.apply(frame);
      updateState(frame.state);
      $("#time").textContent = clock(frame.t);
      $("#source-label").textContent = "LIVE RUST OUTPUT";
      $("#live").classList.add("active");
    };
    live.onerror = () => {
      live.close();
      live = null;
      $("#live").classList.remove("active");
      $("#source-label").textContent = "LIVE CONNECTION FAILED";
      $("#error").hidden = false;
      $("#error").textContent =
        "The local demo is not connected. Start make demo, then reconnect.";
      for (const selector of ["#play", "#replay", "#timeline", "#speed"])
        $(selector).disabled = false;
    };
    $("#error").hidden = true;
    for (const selector of ["#play", "#replay", "#timeline", "#speed"])
      $(selector).disabled = true;
  };
  seek(0);
  updatePlay();
  if (captureMode) viewer.captureCamera();
  let previous = performance.now();
  function animate(now) {
    const delta = (now - previous) / 1000;
    previous = now;
    if (playing && !live) {
      seek(t + delta * speed);
      if (t >= recording.duration) {
        playing = false;
        updatePlay();
      }
    }
    viewer.render();
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  window.portfolio = {
    ready: true,
    duration: recording.duration,
    seek(time) {
      playing = false;
      seek(time);
      viewer.render();
    },
    pixelSummary() {
      const gl = viewer.renderer.getContext();
      const bytes = new Uint8Array(
        gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
      );
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
      let yellow = 0,
        dark = 0;
      for (let i = 0; i < bytes.length; i += 4) {
        if (
          bytes[i] > 140 &&
          bytes[i + 1] > 90 &&
          bytes[i + 2] < 140 &&
          bytes[i] > bytes[i + 2] * 1.3
        )
          yellow++;
        if (bytes[i] < 100 && bytes[i + 1] < 110 && bytes[i + 2] < 120) dark++;
      }
      return {
        yellow,
        dark,
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
      };
    },
  };
} catch (error) {
  $("#error").hidden = false;
  $("#error").textContent = `The performance could not load: ${error.message}`;
  console.error(error);
}
