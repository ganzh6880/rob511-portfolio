import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const vector = (text, defaults) =>
  text ? text.trim().split(/\s+/).map(Number) : defaults;
const dark = new THREE.MeshStandardMaterial({
  color: 0x202628,
  roughness: 0.58,
  metalness: 0.25,
});

export function createViewer(container, urdf) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#eef0ed");
  const camera = new THREE.PerspectiveCamera(33, 1, 0.01, 100);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute(
    "aria-label",
    "Three-dimensional robot performing the recorded choreography",
  );
  renderer.domElement.setAttribute("role", "img");
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.8;
  controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI * 0.49;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa8a1, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, -4, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -3,
    right: 3,
    top: 3,
    bottom: -3,
    near: 0.1,
    far: 15,
  });
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd4e6ec, 1.2);
  rim.position.set(-3, 2, 4);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0xe9ede9, roughness: 1 }),
  );
  floor.position.z = -0.005;
  floor.receiveShadow = true;
  scene.add(floor);
  const circle = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 0.968, 96),
    new THREE.MeshBasicMaterial({ color: 0xb4c1b9, side: THREE.DoubleSide }),
  );
  circle.position.z = 0.002;
  scene.add(circle);
  const ticks = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const mark = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.008, 0.002),
      new THREE.MeshBasicMaterial({ color: 0x87988e }),
    );
    mark.position.set(
      Math.cos((i * Math.PI) / 2) * 1.06,
      Math.sin((i * Math.PI) / 2) * 1.06,
      0.003,
    );
    mark.rotation.z = (i * Math.PI) / 2;
    ticks.add(mark);
  }
  scene.add(ticks);

  const xml = new DOMParser().parseFromString(urdf, "text/xml");
  if (xml.querySelector("parsererror")) throw Error("Invalid robot XML");
  const links = new Map();
  const axes = [];
  for (const link of xml.documentElement.children) {
    if (link.tagName !== "link") continue;
    const frame = new THREE.Group();
    frame.name = link.getAttribute("name");
    scene.add(frame);
    links.set(frame.name, frame);
    const visual = link.querySelector(":scope > visual");
    if (visual) {
      const origin = visual.querySelector(":scope > origin");
      const shape = visual.querySelector("geometry").firstElementChild;
      let geometry;
      if (shape.tagName === "box") {
        const [x, y, z] = vector(shape.getAttribute("size"));
        geometry = new RoundedBoxGeometry(x, y, z, 3, 0.025);
      } else if (shape.tagName === "sphere") {
        geometry = new THREE.SphereGeometry(
          Number(shape.getAttribute("radius")),
          32,
          24,
        );
      } else throw Error(`Unsupported demo geometry: ${shape.tagName}`);
      const color = vector(
        visual.querySelector("color")?.getAttribute("rgba"),
        [0.8, 0.8, 0.8, 1],
      );
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(
          ...color.slice(0, 3),
          THREE.SRGBColorSpace,
        ),
        roughness: 0.48,
        metalness: 0.18,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.fromArray(vector(origin?.getAttribute("xyz"), [0, 0, 0]));
      const [r, p, y] = vector(origin?.getAttribute("rpy"), [0, 0, 0]);
      mesh.rotation.set(r, p, y, "ZYX");
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      frame.add(mesh);
      if (frame.name === "head") {
        const visor = new THREE.Mesh(
          new RoundedBoxGeometry(0.065, 0.245, 0.075, 3, 0.025),
          dark,
        );
        visor.position.set(0.127, 0, 0.015);
        frame.add(visor);
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(
            new THREE.BoxGeometry(0.004, 0.052, 0.012),
            new THREE.MeshBasicMaterial({ color: 0xb4eadb }),
          );
          eye.position.set(0.161, side * 0.064, 0.018);
          frame.add(eye);
        }
      }
      if (/upper|forearm|leg/.test(frame.name)) {
        const dimensions = vector(shape.getAttribute("size"));
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.006, 0.045, dimensions[2] * 0.91),
          dark,
        );
        stripe.position.copy(mesh.position);
        stripe.position.x -= dimensions[0] / 2 + 0.003;
        frame.add(stripe);
        const frontStripe = stripe.clone();
        frontStripe.position.x *= -1;
        frame.add(frontStripe);
      }
      if (/upper|forearm/.test(frame.name)) {
        const joint = new THREE.Mesh(
          new THREE.SphereGeometry(0.087, 20, 16),
          dark,
        );
        joint.castShadow = true;
        frame.add(joint);
      }
      if (frame.name === "torso") {
        for (const side of [-1, 1]) {
          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.008, 0.035, 0.44),
            dark,
          );
          stripe.position.set(0.14, side * 0.17, 0.25);
          frame.add(stripe);
        }
        const badge = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 0.08, 0.055),
          dark,
        );
        badge.position.set(0.14, 0, 0.37);
        frame.add(badge);
      }
    }
    const axis = new THREE.AxesHelper(0.18);
    axis.visible = false;
    axis.material.depthTest = false;
    axis.renderOrder = 10;
    frame.add(axis);
    axes.push(axis);
  }
  const matrix = new THREE.Matrix4();
  const pa = new THREE.Vector3(),
    pb = new THREE.Vector3(),
    scale = new THREE.Vector3();
  const qa = new THREE.Quaternion(),
    qb = new THREE.Quaternion();
  function apply(a, b = a, alpha = 0) {
    const next = new Map(b.transforms.map((t) => [t.child_frame_id, t]));
    for (const item of a.transforms) {
      const link = links.get(item.child_frame_id);
      if (!link) throw Error(`Unknown captured link: ${item.child_frame_id}`);
      matrix.fromArray(item.matrix).decompose(pa, qa, scale);
      matrix
        .fromArray(next.get(item.child_frame_id).matrix)
        .decompose(pb, qb, scale);
      link.position.copy(pa).lerp(pb, alpha);
      link.quaternion.copy(qa).slerp(qb, alpha);
    }
  }
  function reset() {
    camera.position.set(4, -5, 2.8);
    controls.target.set(0.08, 0, 0.96);
    controls.update();
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.clearViewOffset();
    if (width > 700)
      camera.setViewOffset(width, height, -width * 0.13, 0, width, height);
    else camera.setViewOffset(width, height, 0, -height * 0.1, width, height);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  reset();
  resize();
  return {
    renderer,
    camera,
    scene,
    controls,
    apply,
    reset,
    showAxes(value) {
      axes.forEach((a) => {
        a.visible = value;
      });
    },
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
    captureCamera() {
      camera.clearViewOffset();
      camera.position.set(2.6, -3.5, 2.15);
      controls.target.set(0.12, 0, 0.94);
      controls.update();
    },
  };
}
