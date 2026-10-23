import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "./client.mjs";
import { Choreography, servoStep } from "./fsm.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.resolve(
  process.env.ROB511_RUNTIME_DIR ??
    path.join(root, "../project3-student-kit/starter/rust"),
);
const mode = process.argv[2];
if (!["--capture", "--live"].includes(mode))
  throw Error("Use --capture or --live");
const document = JSON.parse(
  await readFile(path.join(root, "public/project3/choreography.json"), "utf8"),
);
const urdf = await readFile(
  path.join(root, "public/project3/robot.urdf"),
  "utf8",
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Check ownership before launching: never attach accidentally to another runtime.
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", () =>
    reject(
      Error(
        "Port 9095 is occupied. Stop that runtime before starting this demo.",
      ),
    ),
  );
  probe.listen(9095, "127.0.0.1", () => probe.close(resolve));
});
const build = spawn("make", ["build"], { cwd: runtimeRoot, stdio: "inherit" });
const [buildCode] = await once(build, "exit");
if (buildCode !== 0) throw Error("Rust runtime build failed");
const runtime = spawn(
  path.join(runtimeRoot, "target/debug/project3-starter"),
  [],
  { cwd: runtimeRoot, stdio: "inherit" },
);
let client, timer, server;
const subscribers = new Set();
let closing = false;
async function cleanup() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  for (const stream of subscribers) stream.end();
  server?.close();
  client?.close();
  if (runtime.exitCode === null && runtime.signalCode === null) {
    runtime.kill("SIGTERM");
    await once(runtime, "exit");
  }
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => cleanup().then(() => process.exit(0)));

try {
  const deadline = performance.now() + 10000;
  while (!client) {
    if (
      runtime.exitCode !== null ||
      runtime.signalCode !== null ||
      performance.now() > deadline
    )
      throw Error("Runtime did not start");
    try {
      client = await Client.connect();
    } catch (error) {
      if (error.code !== "ECONNREFUSED") throw error;
      await sleep(30);
    }
  }
  const loaded = await client.call("/param_server/set_param", {
    name: "robot_description",
    value: urdf,
  });
  if (!loaded.result) throw Error(loaded.status);
  const loadDeadline = performance.now() + 2000;
  while (true) {
    const status = await client.call("/param_server/get_param", {
      name: "/robot_state_publisher/description_status",
    });
    if (status.values.value?.version === loaded.values.version) {
      if (!status.values.value.accepted) throw Error(status.values.value.error);
      break;
    }
    if (performance.now() > loadDeadline)
      throw Error("Description was not accepted within two seconds");
    await sleep(20);
  }
  await client.subscribe("/joint_states");
  await client.subscribe("/joint_trajectory");
  await client.subscribe("/xform_world");
  for (const topic of ["/joint_states", "/joint_trajectory", "/fsm/status"])
    client.advertise(topic);

  let fsm = new Choreography(document);
  let positions = [...document.states[0].target];
  let servoTarget = [...document.states[0].target];
  let started = performance.now();
  let last = started;
  let stateStarted = 0;
  let observed = {};
  let frame = null;
  const frames = [];
  const events = [{ t: 0, state: fsm.state.name }];
  const stamps = new Map();
  const trajectory = () =>
    client.publish("/joint_trajectory", {
      joint_names: document.jointNames,
      points: [
        {
          positions: fsm.state.target,
          time_from_start: { sec: 0, nanosec: 0 },
        },
      ],
    });
  trajectory();

  if (mode === "--live") {
    server = http.createServer((request, response) => {
      response.setHeader(
        "Access-Control-Allow-Origin",
        "http://127.0.0.1:5173",
      );
      if (request.url === "/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        if (frame) response.write(`data: ${JSON.stringify(frame)}\n\n`);
        subscribers.add(response);
        request.on("close", () => subscribers.delete(response));
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    server.listen(9097, "127.0.0.1");
    await once(server, "listening");
    console.log("Live bridge: http://127.0.0.1:9097/events");
  }

  let finish;
  const completed = new Promise((resolve) => {
    finish = resolve;
  });
  let rejectLoop;
  const loopError = new Promise((_, reject) => {
    rejectLoop = reject;
  });
  client.socket.on("close", () => {
    if (!closing) rejectLoop(Error("Runtime disconnected during choreography"));
  });
  client.onPublish = (topic, message) => {
    if (topic === "/joint_trajectory") {
      const target = message.points.at(-1).positions;
      const byName = new Map(
        message.joint_names.map((name, i) => [name, target[i]]),
      );
      servoTarget = document.jointNames.map((name) => byName.get(name));
      if (
        !servoTarget.every(
          (q, i) =>
            Number.isFinite(q) &&
            q >= document.limits[i][0] &&
            q <= document.limits[i][1],
        )
      ) {
        rejectLoop(
          Error("Trajectory is incomplete or outside the joint limits"),
        );
      }
    }
    if (topic === "/joint_states") {
      observed = Object.fromEntries(
        message.name.map((name, i) => [name, message.position[i]]),
      );
    }
    if (topic === "/xform_world") {
      const stamp = message.transforms[0]?.header.stamp;
      const sent = stamp && stamps.get(`${stamp.sec}:${stamp.nanosec}`);
      if (!sent) return;
      frame = { ...sent, transforms: message.transforms };
      if (!frames.length || frame.t > frames.at(-1).t) frames.push(frame);
      for (const response of subscribers)
        response.write(`data: ${JSON.stringify(frame)}\n\n`);
    }
  };

  timer = setInterval(() => {
    try {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const elapsed = (now - started) / 1000;
      if (elapsed - stateStarted > 12)
        throw Error(`State did not converge: ${fsm.state.name}`);
      if (fsm.observe(observed, elapsed)) {
        stateStarted = elapsed;
        events.push({ t: elapsed, state: fsm.state.name });
        trajectory();
      }
      if (fsm.done) {
        if (mode === "--capture") {
          clearInterval(timer);
          finish();
          return;
        }
        fsm = new Choreography(document);
        started = now;
        stateStarted = 0;
        frames.length = 0;
        stamps.clear();
        events.length = 0;
        events.push({ t: 0, state: fsm.state.name });
        trajectory();
        return;
      }
      positions = servoStep(
        positions,
        servoTarget,
        dt,
        fsm.state.speed,
        fsm.state.gain,
      );
      const seconds = Math.floor(elapsed);
      const stamp = {
        sec: seconds,
        nanosec: Math.floor((elapsed - seconds) * 1e9),
      };
      stamps.set(`${stamp.sec}:${stamp.nanosec}`, {
        t: elapsed,
        state: fsm.state.name,
        positions: [...positions],
      });
      if (stamps.size > 100) stamps.delete(stamps.keys().next().value);
      client.publish("/joint_states", {
        header: { stamp },
        name: document.jointNames,
        position: positions,
      });
      client.publish("/fsm/status", {
        current_state: fsm.state.name,
        time_in_state: elapsed - stateStarted,
        running: true,
      });
    } catch (error) {
      clearInterval(timer);
      rejectLoop(error);
    }
  }, 20);

  await Promise.race([completed, loopError]);
  if (
    frames.length < 50 ||
    new Set(frames.map((f) => f.state)).size !== document.states.length
  )
    throw Error("Incomplete runtime capture");
  const recording = {
    title: document.title,
    source: "Rust runtime /xform_world",
    jointNames: document.jointNames,
    duration: frames.at(-1).t,
    events,
    frames,
  };
  await writeFile(
    path.join(root, "public/project3/recording.json"),
    JSON.stringify(recording),
  );
  console.log(
    `Captured ${frames.length} runtime frames, ${recording.duration.toFixed(2)} seconds, ${events.length} FSM states.`,
  );
} finally {
  await cleanup();
}
