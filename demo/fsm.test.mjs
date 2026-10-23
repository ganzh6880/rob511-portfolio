import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Choreography, servoStep, validateChoreography } from "./fsm.mjs";
const document = JSON.parse(
  readFileSync(
    new URL("../public/project3/choreography.json", import.meta.url),
  ),
);

test("arrival requires observed joint positions, then a continuous hold", () => {
  const fsm = new Choreography(document);
  assert.equal(fsm.observe({}, 5), false);
  const pose = Object.fromEntries(
    document.jointNames.map((name, i) => [name, fsm.state.target[i]]),
  );
  assert.equal(fsm.observe(pose, 6), false);
  assert.equal(fsm.observe(pose, 6.2), false);
  assert.equal(fsm.observe({}, 6.3), false);
  assert.equal(fsm.observe(pose, 8), false);
  assert.equal(fsm.observe(pose, 9.6), true);
  assert.equal(fsm.state.name, "opening_bow");
});

test("servo respects speed bounds and does not overshoot in either direction", () => {
  assert.deepEqual(servoStep([0, 0], [1, -1], 0.02, 2, 10), [0.04, -0.04]);
  assert.deepEqual(servoStep([0.999, -0.999], [1, -1], 0.1, 2, 20), [1, -1]);
  assert.throws(() => servoStep([0], [1], 1, 2, 10));
});

test("all states converge, stay within limits, and terminate", () => {
  const fsm = new Choreography(document);
  let pose = [...fsm.state.target];
  const visited = new Set();
  let duration = 0;
  for (let t = 0; t < 60 && !fsm.done; t += 0.02) {
    visited.add(fsm.state.name);
    pose = servoStep(
      pose,
      fsm.state.target,
      0.02,
      fsm.state.speed,
      fsm.state.gain,
    );
    pose.forEach((q, i) =>
      assert(q >= document.limits[i][0] && q <= document.limits[i][1]),
    );
    fsm.observe(
      Object.fromEntries(document.jointNames.map((n, i) => [n, pose[i]])),
      t,
    );
    duration = t;
  }
  assert(fsm.done);
  assert.equal(visited.size, document.states.length);
  assert(duration >= 20 && duration <= 25);
  assert.deepEqual([...visited], document.states.map((state) => state.name));
});

test("invalid targets and cyclic state tables fail explicitly", () => {
  const invalid = structuredClone(document);
  invalid.states[0].target[0] = 50;
  assert.throws(() => validateChoreography(invalid));
  invalid.states[0].target[0] = 0;
  invalid.states.at(-1).next = "ready";
  assert.throws(() => validateChoreography(invalid));
});
