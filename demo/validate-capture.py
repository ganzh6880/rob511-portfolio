"""Independently check every recorded world transform using matrix FK."""
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

assets = Path(__file__).resolve().parents[1] / 'public/project3'
recording = json.loads((assets / 'recording.json').read_text())
score = json.loads((assets / 'choreography.json').read_text())
robot = ET.fromstring((assets / 'robot.urdf').read_text())
identity = [[float(r == c) for c in range(4)] for r in range(4)]


def multiply(a, b):
    return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def rotation(axis, angle):
    norm = math.sqrt(sum(v*v for v in axis))
    u = [v/norm for v in axis]
    x, y, z = u
    skew = [[0, -z, y], [z, 0, -x], [-y, x, 0]]
    c, s = math.cos(angle), math.sin(angle)
    matrix = [row[:] for row in identity]
    for r in range(3):
        for col in range(3):
            matrix[r][col] = c*(r == col)+(1-c)*u[r]*u[col]+s*skew[r][col]
    return matrix


edges = []
limits = {}
for joint in robot.findall('joint'):
    origin = joint.find('origin')
    xyz = list(map(float, origin.get('xyz', '0 0 0').split())) if origin is not None else [0, 0, 0]
    rpy = list(map(float, origin.get('rpy', '0 0 0').split())) if origin is not None else [0, 0, 0]
    matrix = multiply(rotation([0,0,1], rpy[2]), multiply(rotation([0,1,0], rpy[1]), rotation([1,0,0], rpy[0])))
    for i in range(3):
        matrix[i][3] = xyz[i]
    axis = joint.find('axis')
    axis = list(map(float, axis.get('xyz').split())) if axis is not None else [1, 0, 0]
    limit = joint.find('limit')
    if limit is not None:
        limits[joint.get('name')] = [float(limit.get('lower')), float(limit.get('upper'))]
    edges.append((joint.get('name'), joint.get('type'), joint.find('parent').get('link'),
                  joint.find('child').get('link'), matrix, axis))

assert dict(zip(score['jointNames'], score['limits'])) == limits
assert [event['state'] for event in recording['events']] == [s['name'] for s in score['states']]
previous = -1
maximum_error = 0
for frame in recording['frames']:
    assert frame['t'] > previous
    previous = frame['t']
    positions = dict(zip(recording['jointNames'], frame['positions']))
    assert all(limits[n][0] <= q <= limits[n][1] for n, q in positions.items())
    world = {'base': identity}
    for name, kind, parent, child, origin, axis in edges:
        motion = identity if kind == 'fixed' else rotation(axis, positions[name])
        world[child] = multiply(world[parent], multiply(origin, motion))
    assert {item['child_frame_id'] for item in frame['transforms']} == set(world)
    assert len(frame['transforms']) == len(world)
    for item in frame['transforms']:
        assert item['header']['frame_id'] == 'global_frame'
        expected = world[item['child_frame_id']]
        actual = item['matrix']
        assert len(actual) == 16 and all(math.isfinite(v) for v in actual)
        error = max(abs(actual[4*c+r]-expected[r][c]) for r in range(4) for c in range(4))
        maximum_error = max(maximum_error, error)
        assert error < 1e-4
assert recording['duration'] == recording['frames'][-1]['t']
print(f"Validated {len(recording['frames'])} frames, {len(world)} links; maximum matrix error {maximum_error:.2e}.")
