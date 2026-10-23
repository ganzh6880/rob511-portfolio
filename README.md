# ROB 511 Portfolio: Enter the Robot

A Bruce Lee-inspired, 15-state robot choreography for Project 3. The custom
robot has 16 links, nine actuated joints, and six fixed joints. Its feet remain
planted while its torso, head, and arms perform an opening bow, guard, whole-hand
beckon, alternating punches, measured short-punch finale, recovery, and closing bow. This is kinematic animation, not a dynamics simulation
or a biomechanically accurate martial-arts demonstration.

## View the portfolio

Requires Node.js 22.12+ (developed with Node 24).

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open http://127.0.0.1:5173/. The recorded performance and video are included;
viewing them does not require Rust, a running robot backend, or external services.
Fonts, icons, and Three.js are bundled locally. Reduced-motion users start paused.

```sh
npm run build
npm run preview
```

The static site is in `dist/`. Relative asset paths support the GitHub Pages
repository subpath. Generated build output stays ignored by Git.

## Publish to GitHub Pages

In the repository's Settings > Pages > Build and deployment, select
**GitHub Actions** as the source. This is a one-time setup:
https://github.com/ganzh6880/rob511-portfolio/settings/pages

Review, commit, and push the portfolio from this repository:

```sh
git status --short
git add .
git diff --cached --stat
git commit -m "Add Enter the Robot portfolio and GitHub Pages deployment"
git push origin main
```

The `Deploy portfolio to GitHub Pages` workflow tests the FSM and captured FK,
builds the static site, and deploys only `dist/`. It runs on pushes to `main` and
can also be started manually from Actions. No personal token or custom secret
is needed. Check its result at:
https://github.com/ganzh6880/rob511-portfolio/actions

After a successful deployment, the site is available at:
https://ganzh6880.github.io/rob511-portfolio/

The published site uses the committed recording, MP4, and poster. Rust, the live
bridge, and video rendering are local authoring tools, not hosting dependencies.
After changing choreography, regenerate those assets before pushing. Do not
commit `node_modules/`, `dist/`, or `artifacts/`.

## Run the actual FSM demo

The portfolio's `make demo` starts the existing Rust FK runtime, loads this robot,
and starts the FSM, servo, and local browser bridge. It does not run the older
hard-coded two-joint demonstration from the Rust starter.

Default runtime directory: `../project3-student-kit/starter/rust`.
To use another checkout, set `ROB511_RUNTIME_DIR` to its absolute Rust root.
The runtime must supply `make build` and `target/debug/project3-starter`.
Rust/Cargo and Make are required. Ports 9095 and 9097 must be free.

With the portfolio preview already running on port 5173, use another terminal:

```sh
make demo
```

Select the radio icon labeled Live in the viewer. The routine loops until Ctrl+C,
which shuts down the child runtime and bridge. The bridge accepts local browser
traffic from `http://127.0.0.1:5173`; public visitors use recorded playback.

The path is:

```text
FSM -> /joint_trajectory -> servo -> /joint_states
    -> Rust robot_state_publisher -> /tf
    -> Rust robot_world_state_publisher -> /xform_world
    -> capture / local HTTP event stream -> Three.js
```

Each state requires observed joint positions within 0.012 radians, followed by a
continuous hold. Targets and speed/gain settings are in
`public/project3/choreography.json`. The servo limits joint speed and never
overshoots. The runtime retains responsibility for all FK calculations.

## Recreate the recording and video

```sh
make capture
make test
```

Capture runs one full routine, saves the runtime's actual column-major world
matrices, and stops its child runtime. Each frame includes the corresponding
joint positions and FSM state matched by timestamp. Timing can vary slightly with
scheduling, so rerender the video after making a new capture.

Start the preview, then render in a separate terminal. Video rendering additionally
requires ffmpeg and Playwright's Chromium:

```sh
npx playwright install chromium
npm run video
```

Alternatively set `BROWSER_EXECUTABLE_PATH` to an installed compatible Chromium
binary. Set `PORTFOLIO_URL` if the preview uses a different URL. The renderer seeks
through the captured sequence, records the Three.js scene and state labels at
1280x720 / 30 fps, and encodes H.264 MP4 with a JPEG poster. There is no audio.
It uses linear translation interpolation and quaternion slerp between captured
samples for presentation; it does not calculate a replacement FK trajectory.

Outputs included in this repository:

- `public/project3/enter-the-robot.mp4`: full choreography video.
- `public/project3/poster.jpg`: still from the short-punch phase.
- `public/project3/recording.json`: actual runtime output for interactive replay.
- `public/project3/robot.urdf`: original geometric robot with visual materials.
- `public/project3/choreography.json`: editable movement score.

## Verification

```sh
make test
npm run verify
npm run build
```

`make test` checks FSM arrival/hold behavior, bounded servo motion, state-table
validation, convergence, and every recorded world matrix using an independent
Python matrix-FK calculation. Python 3 is required for the capture check.

`npm run verify` needs the running preview and Chromium. It checks desktop/mobile
canvas pixels, visible motion, frame controls, state seeking, page overflow, and
video metadata. Screenshots go to ignored `artifacts/`.

## Files and attribution

`src/` contains the viewer, playback controls, and page. `demo/` contains the
TCP client, FSM/servo, HTTP bridge, capture, video rendering, and checks. All new
implementation lives in this repository; the sibling Rust runtime is reused
without source changes.

The robot and choreography are original. The visual concept is a stylized tribute
to Bruce Lee; no film footage, photographs, music, or Fetch assets are included.
Dependencies retain their upstream licenses. Course requirements:
https://autorob.org/projects/project3/#portfolio-deliverable
