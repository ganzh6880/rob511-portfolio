export function validateChoreography(document) {
  const { jointNames, limits, states, epsilon } = document;
  if (
    !Array.isArray(jointNames) ||
    !jointNames.length ||
    new Set(jointNames).size !== jointNames.length ||
    !jointNames.every((n) => typeof n === "string" && n.length) ||
    !Array.isArray(limits) ||
    limits.length !== jointNames.length ||
    !limits.every(
      (pair) =>
        pair.length === 2 && pair.every(Number.isFinite) && pair[0] <= pair[1],
    ) ||
    !Number.isFinite(epsilon) ||
    epsilon < 0 ||
    !Array.isArray(states) ||
    !states.length
  )
    throw Error("Invalid choreography schema");
  const names = new Set(states.map((s) => s.name));
  if (names.size !== states.length) throw Error("Duplicate state");
  for (const state of states) {
    if (
      typeof state.name !== "string" ||
      !state.name ||
      !Array.isArray(state.target) ||
      state.target.length !== jointNames.length ||
      !state.target.every(
        (q, i) => Number.isFinite(q) && q >= limits[i][0] && q <= limits[i][1],
      ) ||
      !Number.isFinite(state.speed) ||
      state.speed <= 0 ||
      !Number.isFinite(state.gain) ||
      state.gain <= 0 ||
      !Number.isFinite(state.hold) ||
      state.hold < 0 ||
      (state.next !== null && !names.has(state.next))
    )
      throw Error(`Invalid state: ${state.name}`);
  }
  const visited = new Set();
  let current = states[0];
  while (current) {
    if (visited.has(current.name))
      throw Error("Capture choreography must terminate");
    visited.add(current.name);
    current = states.find((s) => s.name === current.next);
  }
  if (visited.size !== states.length) throw Error("Unreachable state");
  return document;
}

export class Choreography {
  constructor(document) {
    this.document = validateChoreography(document);
    this.state = document.states[0];
    this.arrivedAt = null;
    this.done = false;
  }

  observe(positions, now) {
    if (this.done) return false;
    const arrived = this.document.jointNames.every(
      (name, i) =>
        Number.isFinite(positions[name]) &&
        Math.abs(positions[name] - this.state.target[i]) <=
          this.document.epsilon,
    );
    if (!arrived) {
      this.arrivedAt = null;
      return false;
    }
    this.arrivedAt ??= now;
    if (now - this.arrivedAt < this.state.hold) return false;
    if (this.state.next === null) {
      this.done = true;
      return false;
    }
    this.state = this.document.states.find((s) => s.name === this.state.next);
    this.arrivedAt = null;
    return true;
  }
}

export function servoStep(positions, target, dt, speed, gain) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25)
    throw Error("Servo timing outside permitted interval");
  return positions.map((q, i) => {
    const error = target[i] - q;
    const step = Math.min(
      Math.abs(error),
      Math.abs(error) * gain * dt,
      speed * dt,
    );
    return q + Math.sign(error) * step;
  });
}
