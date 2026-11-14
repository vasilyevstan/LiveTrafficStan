"""Build LiveTrafficStan's low-poly 3D traffic models in Blender.

Repository-original work, distributed with the application under Apache-2.0.

The script stays within Blender MCP safe mode: it imports only bpy, bmesh,
mathutils and math, defines no classes or lambdas, and only calls functions it
defines itself. It runs in two ways:

* Live session (Blender MCP): builds every model in the temporary scene
  LTS_TrafficModels_TMP and lays out a preview grid. Nothing is exported.
* Headless, the canonical and reproducible build used for the committed assets:

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
      --python-expr "import runpy; runpy.run_path(
        'scripts/blender/build-traffic-models.py', run_name='__main__',
        init_globals={'GLB_PATH': '<abs>/src/assets/models/traffic-models-v1.glb',
                      'PNG_PATH': '<abs>/docs/images/traffic-models-v1.png'})"

Model frame: r = starboard, f = forward (nose or bow), u = up, in metres.
Vertices map to Blender (-r, -f, u), so the default glTF +Y-up export yields
+Z forward, +Y up and -X starboard. Each model is centred on its footprint
and rests on u = 0. Body faces are tinted by the app per traffic class and
theme, detail faces use the theme's neutral detail colour, and accent faces
keep their exported colour.
"""

import math

import bmesh
import bpy
import mathutils

MODEL_SET = 'traffic-models-v1'
PREFIX = 'LTS_'
TEMP_SCENE = 'LTS_TrafficModels_TMP'
TAU = math.pi * 2.0

# name: (role, sRGB hex). Body and detail colours are neutral placeholders.
MATERIALS = {
    'body': ('body', '8fb8d6'),
    'detail': ('detail', 'f1f5f9'),
    'dark': ('accent', '26323f'),
    'glass': ('accent', '12324a'),
    'orange': ('accent', 'e8590c'),
    'teal': ('accent', '0b7285'),
    'red': ('accent', 'c92a2a'),
    'yellow': ('accent', 'f59f00'),
    'preview_aircraft': ('preview', '72e4ff'),
    'preview_vessel': ('preview', '60a5fa'),
    'preview_orbital': ('preview', '67d8ff'),
    'preview_rocket': ('preview', 'ffb45f'),
    'preview_debris': ('preview', 'ff7db8'),
    'preview_unknown': ('preview', 'aab8c0'),
    'preview_starlink': ('preview', 'c4b5fd'),
    'preview_train': ('preview', 'a3e635'),
    'preview_train_freight': ('preview', 'fb923c'),
}

try:
    GLB_PATH
except NameError:
    GLB_PATH = None
try:
    PNG_PATH
except NameError:
    PNG_PATH = None


# Geometry primitives. A model is a dict of (r, f, u) vertices, faces and
# per-face material names; every primitive is a closed solid.

def new_model():
    return {'verts': [], 'faces': [], 'mats': []}


def add_verts(model, points):
    base = len(model['verts'])
    model['verts'].extend(points)
    return base


def add_face(model, indices, mat):
    model['faces'].append(indices)
    model['mats'].append(mat)


def extrude(model, loop, offset, mat, side_mat=None):
    n = len(loop)
    top = [(p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]) for p in loop]
    a = add_verts(model, loop)
    b = add_verts(model, top)
    add_face(model, [a + i for i in range(n)][::-1], mat)
    add_face(model, [b + i for i in range(n)], mat)
    for i in range(n):
        j = (i + 1) % n
        add_face(model, [a + i, a + j, b + j, b + i], side_mat or mat)


def prism(model, outline, u0, u1, mat, side_mat=None):
    """Vertical prism from an (r, f) outline."""
    extrude(model, [(p[0], p[1], u0) for p in outline], (0.0, 0.0, u1 - u0), mat, side_mat)


def box(model, r0, r1, f0, f1, u0, u1, mat):
    prism(model, [(r0, f0), (r1, f0), (r1, f1), (r0, f1)], u0, u1, mat)


def plate_r(model, outline, r0, r1, mat):
    """Plate drawn in the (f, u) plane and extruded across r."""
    extrude(model, [(r0, p[0], p[1]) for p in outline], (r1 - r0, 0.0, 0.0), mat)


def plate_f(model, outline, f0, f1, mat):
    """Plate drawn in the (r, u) plane and extruded along f."""
    extrude(model, [(p[0], f0, p[1]) for p in outline], (0.0, f1 - f0, 0.0), mat)


def circle(n, r_c, f_c, rad_r, rad_f=None):
    if rad_f is None:
        rad_f = rad_r
    return [(r_c + rad_r * math.cos(TAU * i / n), f_c + rad_f * math.sin(TAU * i / n)) for i in range(n)]


def mirrored(outline):
    return [(-p[0], p[1]) for p in outline][::-1]


def wing_pair(model, root, tip, thickness, mat):
    """root and tip: (r, f_leading, f_trailing, u). Mirrored to port."""
    for side in (1.0, -1.0):
        loop = [
            (side * root[0], root[1], root[3]),
            (side * tip[0], tip[1], tip[3]),
            (side * tip[0], tip[2], tip[3]),
            (side * root[0], root[2], root[3]),
        ]
        extrude(model, loop, (0.0, 0.0, thickness), mat)


def ring(n, f, rad_r, rad_u, u_c, r_c):
    points = []
    for i in range(n):
        a = math.pi / 2.0 + math.pi / n - TAU * i / n
        points.append((r_c + rad_r * math.cos(a), f, u_c + rad_u * math.sin(a)))
    return points


def loft(model, sections, n, mat, nose=None, tail=None, r_c=0.0, glass=None, cap_mat=None):
    """Lofted body along f. sections: (f, rad_r, rad_u, u_c) from front to back.
    nose and tail: (f, u) apex points, or None for a flat cap (front cap uses
    cap_mat). glass: {(gap, segment): material}; gap -1 is the nose fan and
    segment 0 is the top centre of each ring."""
    glass = glass or {}
    rings = [add_verts(model, ring(n, s[0], s[1], s[2], s[3], r_c)) for s in sections]
    for k in range(len(rings) - 1):
        a = rings[k]
        b = rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            add_face(model, [a + i, a + j, b + j, b + i], glass.get((k, i), mat))
    ends = ((nose, rings[0], -1, cap_mat or mat), (tail, rings[-1], len(rings) - 1, mat))
    for end, base, gap, flat_mat in ends:
        if end is None:
            add_face(model, [base + i for i in range(n)], flat_mat)
            continue
        apex = add_verts(model, [(r_c, end[0], end[1])])
        for i in range(n):
            add_face(model, [base + i, base + (i + 1) % n, apex], glass.get((gap, i), mat))


def hull(model, sections, bow, mat, r_c=0.0):
    """Above-water hull. sections: (f, half_beam_waterline, half_beam_deck,
    deck_u) from stern to bow; bow: (f_waterline, f_deck, deck_u) of the stem."""
    rings = []
    for f, w0, w1, h in sections:
        rings.append(add_verts(model, [(r_c - w0, f, 0.0), (r_c + w0, f, 0.0), (r_c + w1, f, h), (r_c - w1, f, h)]))
    add_face(model, [rings[0] + i for i in range(4)], mat)
    for k in range(len(rings) - 1):
        a = rings[k]
        b = rings[k + 1]
        for i in range(4):
            j = (i + 1) % 4
            add_face(model, [a + i, a + j, b + j, b + i], mat)
    s = add_verts(model, [(r_c, bow[0], 0.0), (r_c, bow[1], bow[2])])
    a = rings[-1]
    add_face(model, [a + 1, s, s + 1, a + 2], mat)
    add_face(model, [a + 0, a + 3, s + 1, s], mat)
    add_face(model, [a + 3, a + 2, s + 1], mat)
    add_face(model, [a + 0, s, a + 1], mat)


def sweep(model, profiles, mat, mats=None):
    """Closed body through equal-sized (r, f, u) profiles, flat-capped at both
    ends. mats: {(gap, segment): material}; segment i joins points i and i + 1."""
    mats = mats or {}
    n = len(profiles[0])
    rings = [add_verts(model, profile) for profile in profiles]
    for k in range(len(rings) - 1):
        a = rings[k]
        b = rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            add_face(model, [a + i, a + j, b + j, b + i], mats.get((k, i), mat))
    add_face(model, [rings[0] + i for i in range(n)][::-1], mat)
    add_face(model, [rings[-1] + i for i in range(n)], mat)


def heel(model, start, degrees, pivot_u):
    """Rotate vertices from index start about the f axis; positive heels to port."""
    a = math.radians(degrees)
    c = math.cos(a)
    s = math.sin(a)
    verts = model['verts']
    for i in range(start, len(verts)):
        r, f, u = verts[i]
        du = u - pivot_u
        verts[i] = (r * c - du * s, f, pivot_u + r * s + du * c)


# Blender datablocks. Only LTS_-prefixed datablocks are created or removed.

def srgb_to_linear(c):
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def material(name):
    role, hex_color = MATERIALS[name]
    linear = [srgb_to_linear(int(hex_color[i:i + 2], 16) / 255.0) for i in (0, 2, 4)]
    rgba = (linear[0], linear[1], linear[2], 1.0)
    mat = bpy.data.materials.get(PREFIX + name)
    if mat is None:
        mat = bpy.data.materials.new(PREFIX + name)
    mat['lts_role'] = role
    mat.diffuse_color = rgba
    mat.roughness = 0.6
    mat.metallic = 0.0
    if mat.node_tree is None:
        mat.use_nodes = True
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            node.inputs['Base Color'].default_value = rgba
            node.inputs['Roughness'].default_value = 0.6
            node.inputs['Metallic'].default_value = 0.0
    return mat


def remove_model(model_id):
    obj = bpy.data.objects.get(PREFIX + model_id)
    if obj is not None:
        bpy.data.objects.remove(obj)
    mesh = bpy.data.meshes.get(PREFIX + model_id + '_mesh')
    if mesh is not None:
        bpy.data.meshes.remove(mesh)


def finish(collection, model, model_id, kind, centre=None):
    """Create the object. The origin is the footprint centre unless centre
    gives an explicit (r, f) origin, for example a hull under a heeled mast."""
    remove_model(model_id)
    verts = model['verts']
    rs = [v[0] for v in verts]
    fs = [v[1] for v in verts]
    us = [v[2] for v in verts]
    r_c = (min(rs) + max(rs)) / 2.0
    f_c = (min(fs) + max(fs)) / 2.0
    if centre is not None:
        r_c = centre[0]
        f_c = centre[1]
    u_0 = min(us)
    coords = [(-(v[0] - r_c), -(v[1] - f_c), v[2] - u_0) for v in verts]
    mesh = bpy.data.meshes.new(PREFIX + model_id + '_mesh')
    mesh.from_pydata(coords, [], model['faces'])
    order = []
    for name in model['mats']:
        if name not in order:
            order.append(name)
    for name in order:
        mesh.materials.append(material(name))
    for polygon, name in zip(mesh.polygons, model['mats']):
        polygon.material_index = order.index(name)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(PREFIX + model_id, mesh)
    collection.objects.link(obj)
    obj['lts_model_id'] = model_id
    obj['lts_kind'] = kind
    obj['lts_model_set'] = MODEL_SET
    obj['lts_length_m'] = round(max(fs) - min(fs), 2)
    obj['lts_beam_m'] = round(max(rs) - min(rs), 2)
    obj['lts_height_m'] = round(max(us) - u_0, 2)
    print('%-34s tris=%4d L=%6.1f B=%5.1f H=%5.1f' % (
        obj.name, len(mesh.polygons), obj['lts_length_m'], obj['lts_beam_m'], obj['lts_height_m']))
    return obj


# Aircraft, at real-world proportions. The app applies its own on-screen
# minimum size, so small details only matter when zoomed in.

COCKPIT = {(0, 7): 'glass', (0, 0): 'glass', (0, 1): 'glass'}


def model_airliner(collection):
    m = new_model()
    loft(m, [(17.6, 1.0, 1.05, 2.2), (15.5, 1.75, 1.85, 2.35), (13.0, 2.0, 2.1, 2.4),
             (-8.0, 2.0, 2.1, 2.4), (-12.5, 1.55, 1.6, 2.85), (-16.0, 0.75, 0.8, 3.4)],
         8, 'body', nose=(19.0, 2.1), tail=(-18.2, 3.7), glass=COCKPIT)
    wing_pair(m, (1.5, 5.6, -1.6, 1.2), (17.5, -1.4, -4.6, 2.2), 0.4, 'body')
    for side in (1.0, -1.0):
        loft(m, [(4.4, 0.95, 0.95, 0.95), (0.6, 0.76, 0.76, 0.95)], 6, 'detail',
             r_c=side * 5.9, cap_mat='dark')
    wing_pair(m, (0.8, -12.6, -16.2, 3.4), (6.4, -16.2, -17.9, 3.8), 0.25, 'body')
    plate_r(m, [(-10.5, 4.0), (-15.6, 11.2), (-18.4, 11.2), (-17.6, 3.7)], -0.18, 0.18, 'body')
    return finish(collection, m, 'aircraft', 'aircraft')


def model_light_aircraft(collection):
    m = new_model()
    loft(m, [(3.8, 0.45, 0.45, 1.2), (2.6, 0.6, 0.7, 1.3), (0.5, 0.6, 0.75, 1.4),
             (-1.5, 0.4, 0.5, 1.5), (-3.6, 0.15, 0.2, 1.6)],
         6, 'body', nose=(4.3, 1.2), tail=(-4.0, 1.65),
         glass={(1, 5): 'glass', (1, 0): 'glass', (1, 1): 'glass'})
    wing_pair(m, (0.3, 1.6, 0.1, 2.05), (5.5, 1.5, 0.3, 2.1), 0.16, 'body')
    box(m, -0.95, 0.95, 4.35, 4.45, 1.12, 1.28, 'dark')
    wing_pair(m, (0.1, -3.0, -3.9, 1.55), (1.75, -3.25, -3.9, 1.55), 0.1, 'body')
    plate_r(m, [(-2.4, 1.8), (-3.5, 2.95), (-4.05, 2.95), (-3.95, 1.6)], -0.06, 0.06, 'body')
    return finish(collection, m, 'aircraft-light', 'aircraft')


def model_heavy_aircraft(collection):
    m = new_model()
    loft(m, [(32.5, 1.7, 1.8, 3.9), (29.0, 2.9, 3.1, 4.1), (25.0, 3.1, 3.3, 4.2),
             (-17.0, 3.1, 3.3, 4.2), (-25.5, 2.4, 2.5, 4.8), (-31.5, 1.2, 1.3, 5.7)],
         8, 'body', nose=(35.0, 3.8), tail=(-35.0, 6.2), glass=COCKPIT)
    wing_pair(m, (2.5, 11.0, -3.5, 2.0), (32.0, -11.5, -15.5, 4.6), 0.8, 'body')
    for side in (1.0, -1.0):
        loft(m, [(9.5, 1.65, 1.65, 1.65), (3.0, 1.32, 1.32, 1.65)], 8, 'detail',
             r_c=side * 10.5, cap_mat='dark')
    wing_pair(m, (1.5, -24.0, -30.5, 5.6), (12.0, -30.0, -33.5, 6.2), 0.4, 'body')
    plate_r(m, [(-20.5, 7.0), (-30.5, 19.0), (-34.5, 19.0), (-33.0, 6.5)], -0.3, 0.3, 'body')
    return finish(collection, m, 'aircraft-heavy', 'aircraft')


def model_helicopter(collection):
    m = new_model()
    canopy = {(-1, 6): 'glass', (-1, 7): 'glass', (-1, 0): 'glass', (-1, 1): 'glass',
              (-1, 2): 'glass', (0, 7): 'glass', (0, 0): 'glass', (0, 1): 'glass'}
    loft(m, [(2.8, 0.55, 0.6, 1.4), (1.8, 0.85, 0.9, 1.5), (-0.4, 0.85, 0.95, 1.55),
             (-1.6, 0.5, 0.6, 1.75)], 8, 'body', nose=(3.2, 1.35), tail=(-2.0, 1.8), glass=canopy)
    loft(m, [(-1.4, 0.25, 0.28, 1.9), (-6.6, 0.12, 0.14, 2.0)], 6, 'body')
    box(m, -0.45, 0.45, -1.4, 0.6, 2.1, 2.7, 'body')
    prism(m, circle(6, 0.0, 0.0, 0.12), 2.6, 3.15, 'dark')
    box(m, -5.25, 5.25, -0.18, 0.18, 3.1, 3.2, 'detail')
    box(m, -0.18, 0.18, -5.25, 5.25, 3.1, 3.2, 'detail')
    plate_r(m, [(-5.9, 2.0), (-6.4, 3.0), (-6.9, 3.0), (-6.7, 1.7)], -0.06, 0.06, 'body')
    wing_pair(m, (0.0, -4.6, -5.2, 1.95), (1.1, -4.75, -5.2, 1.95), 0.08, 'body')
    plate_r(m, [(-7.2, 1.95), (-6.0, 1.95), (-6.0, 2.15), (-7.2, 2.15)], 0.08, 0.13, 'detail')
    plate_r(m, [(-6.7, 1.45), (-6.5, 1.45), (-6.5, 2.65), (-6.7, 2.65)], 0.08, 0.13, 'detail')
    for side in (1.0, -1.0):
        box(m, side * 0.9, side * 1.02, -1.6, 2.3, 0.0, 0.1, 'dark')
    box(m, -0.96, 0.96, 1.15, 1.25, 0.05, 0.75, 'dark')
    box(m, -0.96, 0.96, -0.85, -0.75, 0.05, 0.85, 'dark')
    return finish(collection, m, 'helicopter', 'aircraft')


def build_aircraft(collection):
    return [model_airliner(collection), model_light_aircraft(collection),
            model_heavy_aircraft(collection), model_helicopter(collection)]


# Vessels. Hulls are the above-water body; superstructure is detail.

def model_vessel(collection):
    m = new_model()
    hull(m, [(-30.0, 4.6, 5.2, 4.0), (-20.0, 5.2, 5.5, 4.0), (10.0, 5.2, 5.5, 4.2),
             (20.0, 4.0, 4.8, 4.6)], (27.5, 30.0, 5.0), 'body')
    box(m, -3.8, 3.8, 2.0, 15.0, 4.0, 5.3, 'detail')
    box(m, -3.8, 3.8, -13.0, 0.5, 4.0, 5.3, 'detail')
    box(m, -4.2, 4.2, -27.0, -17.5, 4.0, 9.0, 'detail')
    box(m, -5.0, 5.0, -21.0, -17.5, 9.0, 11.5, 'detail')
    box(m, -4.6, 4.6, -17.6, -17.3, 10.0, 11.0, 'glass')
    prism(m, circle(6, 0.0, -24.0, 1.2, 1.6), 9.0, 12.5, 'dark')
    prism(m, circle(6, 0.0, 18.0, 0.25), 4.6, 12.0, 'dark')
    return finish(collection, m, 'vessel', 'vessel')


def model_cargo_vessel(collection):
    m = new_model()
    hull(m, [(-100.0, 14.0, 15.5, 12.0), (-80.0, 15.5, 16.0, 12.0), (55.0, 15.5, 16.0, 12.0),
             (80.0, 10.0, 13.0, 13.5)], (94.0, 100.0, 14.0), 'body')
    colours = ['orange', 'teal', 'red', 'teal', 'orange', 'yellow', 'teal', 'red', 'orange']
    tops = [30.0, 32.0, 33.0, 33.0, 33.0, 32.0, 31.0, 29.0, 26.0]
    for i in range(9):
        f0 = -62.0 + i * 15.3
        half = 13.5 if f0 < 52.0 else 10.5
        box(m, -half, half, f0, f0 + 13.5, 12.0, tops[i], colours[i])
    box(m, -12.0, 12.0, -84.0, -72.0, 12.0, 34.0, 'detail')
    box(m, -16.0, 16.0, -76.0, -72.0, 31.0, 34.0, 'detail')
    box(m, -15.5, 15.5, -72.2, -71.8, 32.0, 33.4, 'glass')
    prism(m, circle(8, 0.0, -90.0, 3.5, 4.5), 12.0, 36.0, 'dark')
    return finish(collection, m, 'vessel-cargo', 'vessel')


def model_tanker(collection):
    m = new_model()
    hull(m, [(-115.0, 18.0, 20.0, 14.0), (-95.0, 20.5, 21.0, 14.0), (70.0, 20.5, 21.0, 14.0),
             (95.0, 14.0, 17.0, 15.0)], (108.0, 115.0, 15.5), 'body')
    for f_c in (72.0, 38.0, 4.0, -30.0):
        hexagon = [(-10.0, f_c), (-6.0, f_c + 6.0), (6.0, f_c + 6.0), (10.0, f_c),
                   (6.0, f_c - 6.0), (-6.0, f_c - 6.0)]
        prism(m, hexagon, 14.0, 16.0, 'detail')
    box(m, -0.8, 0.8, -84.0, 92.0, 14.0, 17.0, 'dark')
    box(m, -19.0, 19.0, -50.0, -46.0, 14.0, 16.5, 'dark')
    box(m, -14.0, 14.0, -105.0, -88.0, 14.0, 34.0, 'detail')
    box(m, -19.0, 19.0, -92.0, -88.0, 31.0, 34.0, 'detail')
    box(m, -18.5, 18.5, -88.2, -87.8, 32.0, 33.4, 'glass')
    prism(m, circle(8, 0.0, -101.0, 3.5, 4.5), 34.0, 41.0, 'dark')
    return finish(collection, m, 'vessel-tanker', 'vessel')


def model_passenger_vessel(collection):
    m = new_model()
    hull(m, [(-90.0, 13.0, 14.0, 8.0), (-75.0, 14.5, 15.0, 8.0), (40.0, 14.5, 15.0, 8.0),
             (70.0, 9.0, 11.5, 9.0)], (82.0, 90.0, 10.0), 'body')
    tiers = [
        ([(-13.5, -86.0), (13.5, -86.0), (13.5, 45.0), (9.0, 60.0), (-9.0, 60.0), (-13.5, 45.0)], 8.0, 17.0),
        ([(-12.5, -80.0), (12.5, -80.0), (12.5, 40.0), (8.0, 52.0), (-8.0, 52.0), (-12.5, 40.0)], 19.0, 27.0),
        ([(-10.0, -60.0), (10.0, -60.0), (10.0, 30.0), (6.0, 40.0), (-6.0, 40.0), (-10.0, 30.0)], 29.0, 35.0),
    ]
    for i in range(3):
        outline, u0, u1 = tiers[i]
        prism(m, outline, u0, u1, 'detail')
        if i < 2:
            prism(m, tiers[i + 1][0], u1, tiers[i + 1][1], 'detail', side_mat='glass')
    for side in (1.0, -1.0):
        box(m, side * 13.6, side * 14.8, -50.0, 20.0, 12.0, 14.0, 'orange')
    prism(m, circle(8, 0.0, -45.0, 4.0, 6.0), 35.0, 43.0, 'red')
    return finish(collection, m, 'vessel-passenger', 'vessel')


def model_fishing_vessel(collection):
    m = new_model()
    hull(m, [(-12.5, 3.1, 3.5, 2.2), (-8.0, 3.6, 3.75, 2.2), (4.0, 3.6, 3.75, 2.4),
             (8.0, 2.6, 3.1, 2.8)], (10.5, 12.5, 3.2), 'body')
    box(m, -2.2, 2.2, 1.5, 6.0, 2.4, 5.4, 'detail')
    box(m, -2.0, 2.0, 5.95, 6.15, 4.3, 5.0, 'glass')
    box(m, -2.0, 2.0, -9.5, -5.5, 2.2, 3.4, 'detail')
    prism(m, circle(6, 0.0, 0.0, 0.18), 2.4, 9.0, 'dark')
    for side in (1.0, -1.0):
        start = (side * 0.3, -1.0, 4.5)
        loop = [(start[0], start[1] - 0.12, start[2] - 0.12), (start[0], start[1] + 0.12, start[2] - 0.12),
                (start[0], start[1] + 0.12, start[2] + 0.12), (start[0], start[1] - 0.12, start[2] + 0.12)]
        extrude(m, loop, (side * 8.2, -5.0, 0.7), 'dark')
    return finish(collection, m, 'vessel-fishing', 'vessel')


def model_tug(collection):
    m = new_model()
    hull(m, [(-15.0, 4.4, 5.0, 2.6), (-10.0, 5.2, 5.5, 2.6), (5.0, 5.2, 5.5, 2.8),
             (10.0, 4.2, 4.8, 3.2)], (13.5, 15.0, 3.4), 'body')
    prism(m, [(-3.2, 12.0), (3.2, 12.0), (2.0, 15.3), (-2.0, 15.3)], 1.6, 3.6, 'dark')
    prism(m, [(-3.6, -2.0), (3.6, -2.0), (4.0, 3.0), (3.0, 6.0), (-3.0, 6.0), (-4.0, 3.0)], 2.6, 5.8, 'detail')
    wheelhouse = [(-2.8, 0.5), (2.8, 0.5), (2.8, 4.8), (2.0, 5.8), (-2.0, 5.8), (-2.8, 4.8)]
    prism(m, wheelhouse, 5.8, 7.6, 'detail', side_mat='glass')
    prism(m, wheelhouse, 7.6, 8.1, 'detail')
    prism(m, circle(6, 0.0, 2.0, 0.15), 8.1, 11.5, 'dark')
    box(m, -1.5, 1.5, -9.0, -6.5, 2.6, 3.8, 'dark')
    return finish(collection, m, 'vessel-tug', 'vessel')


def model_sailing_vessel(collection):
    m = new_model()
    hull(m, [(-7.5, 1.6, 1.9, 1.0), (-4.5, 2.0, 2.2, 1.0), (2.0, 2.0, 2.2, 1.1),
             (5.0, 1.3, 1.7, 1.25)], (6.8, 7.5, 1.35), 'body')
    box(m, -1.2, 1.2, -2.5, 1.5, 1.0, 1.7, 'detail')
    # Mast and sails heel to port so the sails stay readable from above.
    start = len(m['verts'])
    prism(m, circle(6, 0.0, 1.0, 0.1), 1.0, 15.0, 'dark')
    plate_r(m, [(0.8, 2.0), (0.8, 14.5), (-5.5, 2.2)], -0.04, 0.04, 'detail')
    plate_r(m, [(1.3, 12.5), (6.6, 1.6), (1.3, 1.8)], -0.04, 0.04, 'detail')
    heel(m, start, 20.0, 1.0)
    return finish(collection, m, 'vessel-sailing', 'vessel', centre=(0.0, 0.0))


def model_pleasure_vessel(collection):
    m = new_model()
    hull(m, [(-9.0, 2.2, 2.4, 1.6), (-5.0, 2.5, 2.6, 1.6), (3.0, 2.4, 2.55, 1.8),
             (6.5, 1.5, 2.0, 2.0)], (8.0, 9.0, 2.1), 'body')
    cabin = [(-1.9, -3.5), (1.9, -3.5), (1.7, 2.5), (1.0, 4.0), (-1.0, 4.0), (-1.7, 2.5)]
    prism(m, cabin, 1.6, 2.2, 'detail')
    prism(m, cabin, 2.2, 2.9, 'detail', side_mat='glass')
    prism(m, [(-1.6, -2.5), (1.6, -2.5), (1.4, 2.0), (-1.4, 2.0)], 2.9, 3.5, 'detail')
    arch = [(-1.5, 2.9), (-1.1, 2.9), (-0.9, 4.4), (0.9, 4.4), (1.1, 2.9), (1.5, 2.9), (1.2, 4.8), (-1.2, 4.8)]
    plate_f(m, arch, -2.4, -1.9, 'dark')
    box(m, -1.6, 1.6, -7.5, -6.5, 1.6, 2.2, 'detail')
    return finish(collection, m, 'vessel-pleasure', 'vessel')


def model_highspeed_vessel(collection):
    m = new_model()
    for side in (1.0, -1.0):
        hull(m, [(-20.0, 1.3, 1.5, 2.6), (-12.0, 1.5, 1.6, 2.6), (10.0, 1.5, 1.6, 2.7),
                 (15.0, 1.0, 1.2, 2.9)], (18.5, 20.0, 3.0), 'body', r_c=side * 4.5)
    box(m, -5.8, 5.8, -17.0, 10.0, 2.4, 3.6, 'body')
    cabin = [(-5.6, -12.0), (5.6, -12.0), (5.4, 4.0), (3.5, 9.0), (-3.5, 9.0), (-5.4, 4.0)]
    prism(m, cabin, 3.6, 4.6, 'detail')
    prism(m, cabin, 4.6, 5.7, 'detail', side_mat='glass')
    prism(m, [(-5.2, -11.0), (5.2, -11.0), (5.0, 3.5), (3.2, 8.0), (-3.2, 8.0), (-5.0, 3.5)], 5.7, 6.4, 'detail')
    prism(m, [(-3.0, 1.0), (3.0, 1.0), (2.6, 6.0), (-2.6, 6.0)], 6.4, 7.8, 'detail', side_mat='glass')
    return finish(collection, m, 'vessel-highspeed', 'vessel')


def build_vessels(collection):
    return [model_vessel(collection), model_cargo_vessel(collection), model_tanker(collection),
            model_passenger_vessel(collection), model_fishing_vessel(collection), model_tug(collection),
            model_sailing_vessel(collection), model_pleasure_vessel(collection),
            model_highspeed_vessel(collection)]


# Orbital objects, drawn from the map icon outlines (64 px canvas, y down =
# aft). Forward (+f) is the direction of travel. Catalog records carry no
# physical size, so sizes are nominal.

DEBRIS_OUTLINE = [(8, 19), (27, 23), (35, 7), (43, 25), (59, 31), (43, 39), (50, 56), (32, 47),
                  (19, 59), (20, 41), (5, 33)]
UNKNOWN_OUTLINE = [(32, 6), (49, 19), (54, 36), (42, 53), (32, 59), (22, 53), (10, 36), (15, 19)]
STARLINK_CHASSIS = [(25, 14), (39, 14), (42, 43), (36, 51), (28, 51), (22, 43)]
STARLINK_PLATE = [(27, 20), (37, 20), (39, 41), (34, 47), (30, 47), (25, 41)]
STARLINK_TAIL = [(27, 51), (37, 51), (40, 60), (24, 60)]


def icon_outline(points, scale):
    return [((p[0] - 32.0) * scale, (32.0 - p[1]) * scale) for p in points]


def model_payload(collection):
    m = new_model()
    box(m, -1.6, 1.6, -2.6, 2.2, -1.4, 1.4, 'detail')
    box(m, -2.4, 2.4, -0.25, 0.25, -0.15, 0.15, 'dark')
    for side in (1.0, -1.0):
        box(m, side * 2.2, side * 5.6, -2.0, 1.6, -0.08, 0.08, 'body')
    loft(m, [(2.2, 0.6, 0.6, 0.0)], 4, 'detail', nose=(5.0, 0.0))
    return finish(collection, m, 'orbital-payload', 'orbital')


def model_rocket_body(collection):
    m = new_model()
    loft(m, [(4.0, 1.0, 1.0, 0.0), (2.0, 2.0, 2.0, 0.0), (1.4, 1.95, 1.95, 0.0), (0.8, 1.9, 1.9, 0.0),
             (-3.4, 1.6, 1.6, 0.0), (-5.0, 0.6, 0.6, 0.0)],
         6, 'body', nose=(5.6, 0.0), glass={(2, 0): 'detail', (2, 1): 'detail', (2, 2): 'detail',
                                            (2, 3): 'detail', (2, 4): 'detail', (2, 5): 'detail'})
    loft(m, [(-4.8, 0.45, 0.45, 0.0), (-5.8, 0.8, 0.8, 0.0)], 6, 'dark')
    for side in (1.0, -1.0):
        extrude(m, [(side * 1.5, -1.4, -0.06), (side * 4.4, -4.4, -0.06), (side * 1.3, -3.6, -0.06)],
                (0.0, 0.0, 0.12), 'body')
    return finish(collection, m, 'orbital-rocket-body', 'orbital')


def model_debris(collection):
    m = new_model()
    prism(m, icon_outline(DEBRIS_OUTLINE, 0.05), -0.22, 0.22, 'body')
    prism(m, icon_outline([(29, 27), (38, 30), (35, 40), (27, 38)], 0.05), 0.2, 0.4, 'detail')
    heel(m, 0, 25.0, 0.0)
    return finish(collection, m, 'orbital-debris', 'orbital')


def model_unknown(collection):
    m = new_model()
    base = add_verts(m, [(p[0], p[1], 0.0) for p in icon_outline(UNKNOWN_OUTLINE, 0.1)])
    apex = add_verts(m, [(0.0, -0.3, 1.6), (0.0, -0.3, -1.6)])
    n = len(UNKNOWN_OUTLINE)
    for i in range(n):
        j = (i + 1) % n
        add_face(m, [base + i, base + j, apex], 'body')
        add_face(m, [base + j, base + i, apex + 1], 'body')
    return finish(collection, m, 'orbital-unknown', 'orbital')


def model_starlink(collection):
    m = new_model()
    scale = 0.33
    box(m, -9.57, 9.57, -0.99, 3.96, 0.0, 0.12, 'body')
    prism(m, icon_outline(STARLINK_CHASSIS, scale), 0.0, 0.4, 'body')
    prism(m, icon_outline(STARLINK_PLATE, scale), 0.4, 0.5, 'detail')
    prism(m, icon_outline(STARLINK_TAIL, scale), 0.05, 0.3, 'body')
    return finish(collection, m, 'orbital-starlink-spacecraft', 'orbital')


# Named spacecraft, used only for exactly reviewed featured catalog identities.
# Nominal real-world proportions; attitude is drawn along the ground track.

def model_iss(collection):
    m = new_model()
    box(m, -54.5, 54.5, 4.4, 7.6, 2.6, 5.4, 'detail')
    box(m, -1.0, 1.0, 4.6, 7.4, 2.0, 2.7, 'detail')
    loft(m, [(21.0, 2.2, 2.2, 0.0), (2.0, 2.2, 2.2, 0.0)], 8, 'detail')
    loft(m, [(2.0, 2.3, 2.3, 0.0), (-3.0, 2.3, 2.3, 0.0)], 8, 'detail')
    loft(m, [(-3.0, 2.05, 2.05, 0.0), (-16.0, 2.05, 2.05, 0.0)], 8, 'detail')
    loft(m, [(-16.0, 2.1, 2.1, 0.0), (-28.0, 2.1, 2.1, 0.0), (-31.0, 1.4, 1.4, 0.0)], 8, 'detail')
    box(m, 2.0, 9.0, 13.0, 17.5, -2.0, 2.0, 'detail')
    box(m, -13.0, -2.0, 12.5, 18.0, -2.2, 2.2, 'detail')
    box(m, -18.0, -13.0, 13.5, 17.0, -1.0, 1.0, 'dark')
    for side in (1.0, -1.0):
        box(m, side * 13.0, side * 22.0, -4.0, 4.4, 3.9, 4.1, 'detail')
        box(m, side * 2.1, side * 14.0, -22.5, -20.0, -0.06, 0.06, 'body')
        for r0 in (32.5, 44.0):
            r_c = side * (r0 + 5.25)
            box(m, side * r0, side * (r0 + 10.5), 8.6, 41.6, 3.9, 4.1, 'body')
            box(m, side * r0, side * (r0 + 10.5), -29.6, 3.4, 3.9, 4.1, 'body')
            box(m, r_c - 0.3, r_c + 0.3, -29.6, 41.6, 3.8, 4.3, 'dark')
    return finish(collection, m, 'orbital-iss', 'orbital')


def model_hubble(collection):
    m = new_model()
    loft(m, [(6.0, 1.55, 1.55, 0.0), (-1.0, 1.55, 1.55, 0.0)], 8, 'detail', cap_mat='dark')
    loft(m, [(-1.0, 2.1, 2.1, 0.0), (-6.6, 2.1, 2.1, 0.0)], 8, 'detail')
    plate_r(m, [(6.0, 1.55), (8.6, 3.05), (8.54, 3.15), (5.94, 1.65)], -1.55, 1.55, 'detail')
    for side in (1.0, -1.0):
        box(m, side * 1.9, side * 7.4, -1.6, -1.4, -0.12, 0.12, 'dark')
        box(m, side * 2.4, side * 7.4, -2.8, -0.2, -0.05, 0.05, 'body')
        box(m, side * 0.15, side * -0.15, -4.2, -3.9, side * 2.0, side * 3.6, 'dark')
    return finish(collection, m, 'orbital-hubble', 'orbital')


def build_orbital(collection):
    return [model_payload(collection), model_rocket_body(collection), model_debris(collection),
            model_unknown(collection), model_starlink(collection), model_iss(collection),
            model_hubble(collection)]


# Trains: original, unbranded generic rolling stock at real proportions. Front
# (+f) is the reported direction of travel; u = 0 is the rail head.

def car_profile(f, w, u0, u1, ch):
    """Car-body section with a side window band between 45% and 75% of the
    wall height. Segments 2 and 8 are the window band and segment 5 the roof."""
    wall = u1 - ch - u0
    uw0 = u0 + 0.45 * wall
    uw1 = u0 + 0.75 * wall
    return [(-w, f, u0), (w, f, u0), (w, f, uw0), (w, f, uw1), (w, f, u1 - ch), (w - ch, f, u1),
            (-w + ch, f, u1), (-w, f, u1 - ch), (-w, f, uw1), (-w, f, uw0)]


def model_train(collection):
    m = new_model()
    sections = [(-12.6, 1.5, 1.05, 3.95, 0.35), (9.4, 1.5, 1.05, 3.95, 0.35), (10.9, 1.45, 1.05, 3.7, 0.5),
                (12.1, 1.25, 1.05, 2.75, 0.5), (12.75, 0.85, 1.1, 1.95, 0.3)]
    mats = {(0, 2): 'glass', (0, 8): 'glass', (1, 2): 'glass', (1, 8): 'glass',
            (2, 4): 'glass', (2, 5): 'glass', (2, 6): 'glass'}
    sweep(m, [car_profile(*s) for s in sections], 'body', mats)
    box(m, -0.65, 0.65, -12.75, -12.6, 1.3, 3.5, 'dark')
    box(m, -1.35, 1.35, -11.9, 11.4, 0.7, 1.05, 'dark')
    for f_c in (-9.0, 8.0):
        box(m, -1.3, 1.3, f_c - 1.4, f_c + 1.4, 0.0, 0.85, 'dark')
    box(m, -0.9, 0.9, -10.6, -3.8, 3.95, 4.25, 'detail')
    box(m, -0.55, 0.55, -2.8, -1.2, 3.95, 4.1, 'dark')
    box(m, -0.85, 0.85, -1.6, -1.4, 4.1, 4.25, 'dark')
    for side in (1.0, -1.0):
        box(m, side * 0.4, side * 0.7, 12.55, 12.8, 1.3, 1.55, 'detail')
    return finish(collection, m, 'train', 'train')


def model_freight_train(collection):
    m = new_model()
    box(m, -1.55, 1.55, -10.4, 10.4, 1.15, 1.5, 'dark')
    for f0, f1 in ((10.4, 10.75), (-10.75, -10.4)):
        box(m, -1.5, 1.5, f0, f1, 0.6, 1.5, 'yellow')
    for f_c in (-6.8, 6.8):
        box(m, -1.35, 1.35, f_c - 2.0, f_c + 2.0, 0.0, 1.15, 'dark')
    box(m, -1.2, 1.2, -4.2, 3.8, 0.45, 1.15, 'dark')
    long_hood = [(-1.05, 1.5), (1.05, 1.5), (1.05, 3.6), (0.8, 3.9), (-0.8, 3.9), (-1.05, 3.6)]
    plate_f(m, long_hood, -10.2, 5.6, 'body')
    short_hood = [(-1.0, 1.5), (1.0, 1.5), (1.0, 2.95), (0.8, 3.2), (-0.8, 3.2), (-1.0, 2.95)]
    plate_f(m, short_hood, 8.3, 10.2, 'body')
    box(m, -1.5, 1.5, 5.6, 8.3, 1.5, 2.95, 'body')
    prism(m, [(-1.45, 5.65), (1.45, 5.65), (1.45, 8.25), (-1.45, 8.25)], 2.95, 3.7, 'body', side_mat='glass')
    cab_roof = [(-1.5, 3.7), (1.5, 3.7), (1.5, 3.95), (1.2, 4.25), (-1.2, 4.25), (-1.5, 3.95)]
    plate_f(m, cab_roof, 5.5, 8.4, 'body')
    box(m, -0.65, 0.65, -9.6, -6.0, 3.9, 4.0, 'dark')
    box(m, -0.3, 0.3, 1.5, 2.4, 3.9, 4.15, 'dark')
    box(m, -0.25, 0.25, 10.15, 10.3, 2.6, 2.9, 'detail')
    return finish(collection, m, 'train-freight', 'train')


def build_trains(collection):
    return [model_train(collection), model_freight_train(collection)]


# Scene assembly, preview, export and render.

PREVIEW_MATERIAL = {
    'orbital-payload': 'preview_orbital',
    'orbital-rocket-body': 'preview_rocket',
    'orbital-debris': 'preview_debris',
    'orbital-unknown': 'preview_unknown',
    'orbital-starlink-spacecraft': 'preview_starlink',
    'train-freight': 'preview_train_freight',
}
PREVIEW_ROWS = [
    ['aircraft', 'aircraft-light', 'aircraft-heavy', 'helicopter'],
    ['vessel', 'vessel-cargo', 'vessel-tanker', 'vessel-passenger', 'vessel-fishing'],
    ['vessel-tug', 'vessel-sailing', 'vessel-pleasure', 'vessel-highspeed'],
    ['orbital-payload', 'orbital-rocket-body', 'orbital-debris', 'orbital-unknown',
     'orbital-starlink-spacecraft'],
    ['orbital-iss', 'orbital-hubble', 'train', 'train-freight'],
]
PREVIEW_SIZE = 10.0
PREVIEW_SPACING = 14.0
PREVIEW_HEADING = 60.0


def build_all(collection):
    return (build_aircraft(collection) + build_vessels(collection) + build_orbital(collection)
            + build_trains(collection))


def layout(objects):
    """Preview grid of centred PREVIEW_ROWS; each model is scaled so that its
    larger footprint side is PREVIEW_SIZE. Run only after any export."""
    by_id = {}
    for obj in objects:
        by_id[obj['lts_model_id']] = obj
    for row in range(len(PREVIEW_ROWS)):
        ids = PREVIEW_ROWS[row]
        for column in range(len(ids)):
            obj = by_id[ids[column]]
            factor = PREVIEW_SIZE / max(obj['lts_length_m'], obj['lts_beam_m'])
            obj.scale = (factor, factor, factor)
            obj.rotation_euler = (0.0, 0.0, math.radians(PREVIEW_HEADING))
            x = (column - (len(ids) - 1) / 2.0) * PREVIEW_SPACING
            obj.location = (x, -row * PREVIEW_SPACING, 0.0)


def tint_preview(objects):
    """Show body faces in the dark-theme class colour through object-linked
    slots, leaving the exported mesh materials untouched."""
    for obj in objects:
        name = 'preview_' + obj['lts_kind']
        if obj['lts_model_id'] in PREVIEW_MATERIAL:
            name = PREVIEW_MATERIAL[obj['lts_model_id']]
        preview = material(name)
        for slot in obj.material_slots:
            if slot.material is not None and slot.material.get('lts_role') == 'body':
                slot.link = 'OBJECT'
                slot.material = preview


def temp_scene():
    scene = bpy.data.scenes.get(TEMP_SCENE)
    if scene is None:
        scene = bpy.data.scenes.new(TEMP_SCENE)
    scene.view_settings.view_transform = 'Standard'
    return scene


def export_glb(objects, path):
    bpy.context.view_layer.update()
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    available = [prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties]
    wanted = {
        'export_format': 'GLB',
        'use_selection': True,
        'export_yup': True,
        'export_apply': True,
        'export_normals': False,
        'export_texcoords': False,
        'export_tangents': False,
        'export_attributes': False,
        'export_materials': 'EXPORT',
        'export_extras': True,
        'export_animations': False,
        'export_skins': False,
        'export_morph': False,
        'export_cameras': False,
        'export_lights': False,
        'export_draco_mesh_compression_enable': False,
        'export_copyright': 'LiveTrafficStan contributors, Apache-2.0',
    }
    options = {}
    for key in wanted:
        if key in available:
            options[key] = wanted[key]
    bpy.ops.export_scene.gltf(filepath=path, **options)
    print('exported %s' % path)


def render_sheet(objects, path):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    shading.color_type = 'MATERIAL'
    shading.show_cavity = True
    shading.show_object_outline = True
    scene.display.render_aa = '8'
    scene.view_settings.view_transform = 'Standard'
    if scene.world is None:
        scene.world = bpy.data.worlds.new(PREFIX + 'preview_world')
    scene.world.color = (0.004, 0.009, 0.02)
    cam_data = bpy.data.cameras.new(PREFIX + 'preview_camera')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new(PREFIX + 'preview_camera', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.rotation_euler = (math.radians(56.0), 0.0, 0.0)
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.dither_intensity = 0.0
    bpy.context.view_layer.update()
    to_camera = cam.matrix_world.inverted()
    xs = []
    ys = []
    for obj in objects:
        for corner in obj.bound_box:
            p = to_camera @ (obj.matrix_world @ mathutils.Vector(corner))
            xs.append(p.x)
            ys.append(p.y)
    aspect = scene.render.resolution_x / scene.render.resolution_y
    cam_data.ortho_scale = max(max(xs) - min(xs), (max(ys) - min(ys)) * aspect) * 1.06
    shift = cam.matrix_world.to_3x3() @ mathutils.Vector(((max(xs) + min(xs)) / 2.0, (max(ys) + min(ys)) / 2.0, 0.0))
    back = cam.matrix_world.to_3x3() @ mathutils.Vector((0.0, 0.0, 400.0))
    cam.location = cam.location + shift + back
    cam_data.clip_end = 2000.0
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.compression = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('rendered %s' % path)


def main():
    if bpy.app.background:
        scene = bpy.context.scene
        for obj in list(scene.objects):
            bpy.data.objects.remove(obj)
        objects = build_all(scene.collection)
        if GLB_PATH:
            export_glb(objects, GLB_PATH)
        layout(objects)
        tint_preview(objects)
        if PNG_PATH:
            render_sheet(objects, PNG_PATH)
        return
    scene = temp_scene()
    objects = build_all(scene.collection)
    layout(objects)
    tint_preview(objects)
    bpy.context.window.scene = scene


main()
