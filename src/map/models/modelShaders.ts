/**
 * GLSL port of `modelProjection.ts`. Keep both in step: picking, fades, and
 * selection rings depend on the CPU mirror matching what the GPU draws.
 */
export const MODEL_ATTRIBUTE = {
  position: 0,
  normal: 1,
  color: 2,
  offset: 3,
  geo: 4,
  motion: 5,
  size: 6,
  tint: 7,
  detail: 8,
} as const

const COMMON = `#version 300 es
precision highp float;
precision highp int;

layout(location = 3) in vec2 a_offset;
layout(location = 4) in vec2 a_geo;
layout(location = 5) in vec4 a_motion;
layout(location = 6) in vec4 a_size;

uniform mat4 u_mercator;
uniform mat4 u_globe;
uniform vec3 u_globe_origin;
uniform float u_transition;
uniform vec2 u_k;
uniform float u_center_w;
uniform vec3 u_camera_globe;
uniform vec2 u_camera;
uniform float u_context;
uniform float u_world_offset;
uniform vec2 u_viewport;

const float EARTH_RADIUS = 6371008.8;
const vec4 HIDDEN = vec4(2.0, 2.0, 2.0, 1.0);

float mixT(float mercator, float globe) {
  if (u_transition <= 0.0) return mercator;
  if (u_transition >= 0.999) return globe;
  return mix(mercator, globe, u_transition);
}

vec4 mixT4(vec4 mercator, vec4 globe) {
  if (u_transition <= 0.0) return mercator;
  if (u_transition >= 0.999) return globe;
  return mix(mercator, globe, u_transition);
}

int instanceFlags() {
  return int(a_size.w + 0.5);
}

float baseOpacity() {
  return a_size.z * ((instanceFlags() & 1) != 0 ? u_context : 1.0);
}

float liftedVisibility(float altitude) {
  if (altitude <= 0.0) return 1.0;
  float ratio = mixT(
    altitude * a_motion.x / max(u_camera.x, 1e-12),
    altitude / max(u_camera.y, 1.0)
  );
  return 1.0 - smoothstep(0.55, 0.75, ratio);
}

vec4 projectLocal(vec3 enu, float altitude, out vec4 merc, out vec4 globe, out vec3 sphere) {
  float mpm = a_motion.x;
  merc = u_mercator * vec4(
    a_offset.x + u_world_offset + enu.x * mpm,
    a_offset.y - enu.y * mpm,
    (altitude + enu.z) * mpm,
    1.0
  );
  if (u_transition <= 0.0) {
    globe = merc;
    sphere = vec3(0.0);
    return merc;
  }
  float cosine = cos(a_geo.y);
  vec3 up = vec3(sin(a_geo.x) * cosine, sin(a_geo.y), cos(a_geo.x) * cosine);
  vec3 east = vec3(cos(a_geo.x), 0.0, -sin(a_geo.x));
  vec3 north = cross(up, east);
  vec3 offset = (east * enu.x + north * enu.y + up * (altitude + enu.z)) / EARTH_RADIUS;
  sphere = up + offset;
  // Keep the globe's near-surface depth as precise as the Mercator RTC path.
  globe = u_globe * vec4((up - u_globe_origin) + offset, 1.0);
  return mixT4(merc, globe);
}

bool horizonOccludes(vec3 point) {
  if (u_transition <= 0.5) return false;
  vec3 d = point - u_camera_globe;
  float a = dot(d, d);
  float b = dot(u_camera_globe, d);
  float c = dot(u_camera_globe, u_camera_globe) - 1.0;
  float discriminant = b * b - a * c;
  if (a <= 0.0 || discriminant <= 0.0) return false;
  float root = (-b - sqrt(discriminant)) / a;
  return root > 0.0 && root < 1.0 - 1e-3;
}

float pixelsPerMeter(vec4 merc, vec4 globe) {
  return mixT(u_k.x * a_motion.x / merc.w, u_k.y / (EARTH_RADIUS * globe.w));
}

float perspectiveScale(float w) {
  return clamp(0.5 + 0.5 * u_center_w / w, 0.5, 2.0);
}
`

export const MODEL_VERTEX_SHADER = `${COMMON}
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_color;
layout(location = 7) in vec4 a_tint;
layout(location = 8) in vec4 a_detail;

uniform float u_footprint;
uniform float u_depth_only;
uniform float u_overview_stretch;

out vec4 v_color;
invariant gl_Position;

// normalize(-0.35, 0.45, 0.82), precomputed for strict GLSL ES compilers.
const vec3 LIGHT = vec3(-0.350456, 0.450586, 0.821068);

void main() {
  float altitude = max(a_motion.y, 0.0);
  float visibility = liftedVisibility(altitude);
  bool footprint = u_footprint > 0.5;
  float alpha = baseOpacity() * (footprint ? (1.0 - visibility) * 0.85 : visibility);
  float anchorAltitude = footprint ? 0.0 : altitude;
  vec4 merc;
  vec4 globe;
  vec3 sphere;
  vec4 anchor = projectLocal(vec3(0.0), anchorAltitude, merc, globe, sphere);
  if (alpha < 0.004 || anchor.w <= 0.0 || (u_depth_only > 0.5 && alpha < 0.5) ||
      horizonOccludes(sphere)) {
    gl_Position = HIDDEN;
    v_color = vec4(0.0);
    return;
  }
  float floorPx = a_size.x * perspectiveScale(anchor.w);
  float naturalPx = max(a_size.y * pixelsPerMeter(merc, globe), 1e-6);
  float enlarge = floorPx / naturalPx;
  // x = starboard (beam), y = forward (length), z = up.
  vec3 scale = vec3(
    max(1.0, enlarge * u_overview_stretch),
    max(1.0, enlarge / u_overview_stretch),
    max(1.0, enlarge)
  );
  vec3 local = a_position * (a_motion.w * scale);
  if (footprint) local.z *= 0.02;
  vec3 n = a_normal / scale;
  float c = cos(a_motion.z);
  float s = sin(a_motion.z);
  vec3 enu = vec3(local.x * c + local.y * s, -local.x * s + local.y * c, local.z);
  vec3 normal = vec3(n.x * c + n.y * s, -n.x * s + n.y * c, n.z);
  gl_Position = projectLocal(enu, anchorAltitude, merc, globe, sphere);
  float light = 0.55 + 0.45 * max(dot(normalize(normal), LIGHT), 0.0);
  float role = a_color.a;
  vec3 rgb = role < 0.25 ? a_tint.rgb : role < 0.75 ? a_detail.rgb : a_color.rgb;
  v_color = vec4(rgb * light * alpha, alpha);
}
`

export const MODEL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 fragColor;
void main() {
  fragColor = v_color;
}
`

/** Screen-space 1.5 px quad from the lifted anchor to its ground point. */
export const DROP_LINE_VERTEX_SHADER = `${COMMON}
out float v_alpha;

void main() {
  float altitude = max(a_motion.y, 0.0);
  float alpha = 0.45 * baseOpacity() * liftedVisibility(altitude);
  vec4 merc;
  vec4 globe;
  vec3 topSphere;
  vec3 bottomSphere;
  vec4 top = projectLocal(vec3(0.0), altitude, merc, globe, topSphere);
  vec4 bottom = projectLocal(vec3(0.0), 0.0, merc, globe, bottomSphere);
  v_alpha = alpha;
  if ((instanceFlags() & 2) == 0 || altitude <= 0.0 || alpha < 0.004 ||
      top.w <= 0.0 || bottom.w <= 0.0 ||
      horizonOccludes(topSphere) || horizonOccludes(bottomSphere)) {
    gl_Position = HIDDEN;
    return;
  }
  vec2 direction = (bottom.xy / bottom.w - top.xy / top.w) * u_viewport * 0.5;
  float pixels = length(direction);
  if (pixels < 0.5) {
    gl_Position = HIDDEN;
    return;
  }
  int corner = gl_VertexID % 6;
  bool atBottom = corner == 1 || corner == 4 || corner == 5;
  float side = corner == 2 || corner == 3 || corner == 5 ? 1.0 : -1.0;
  vec2 normal = vec2(-direction.y, direction.x) / pixels;
  vec4 clip = atBottom ? bottom : top;
  gl_Position = vec4(clip.xy + normal * side * (1.5 / u_viewport) * clip.w, clip.z, clip.w);
}
`

export const DROP_LINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 u_overlay_color;
in float v_alpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(u_overlay_color * v_alpha, v_alpha);
}
`

/** Selection ring around the dominant lifted or footprint anchor. */
export const RING_VERTEX_SHADER = `${COMMON}
uniform float u_ring_lifted_only;
out vec2 v_local;
out float v_radius;

void main() {
  float altitude = max(a_motion.y, 0.0);
  float visibility = liftedVisibility(altitude);
  bool lifted = visibility > 0.5;
  float alpha = baseOpacity() * (lifted ? visibility : (1.0 - visibility) * 0.85);
  vec4 merc;
  vec4 globe;
  vec3 sphere;
  vec4 anchor = projectLocal(vec3(0.0), lifted ? altitude : 0.0, merc, globe, sphere);
  v_local = vec2(0.0);
  v_radius = 0.0;
  if ((instanceFlags() & 4) == 0 || (u_ring_lifted_only > 0.5 && !lifted) ||
      alpha < 0.004 || anchor.w <= 0.0 || horizonOccludes(sphere)) {
    gl_Position = HIDDEN;
    return;
  }
  float drawn = max(
    a_size.x * perspectiveScale(anchor.w),
    a_size.y * pixelsPerMeter(merc, globe)
  );
  float radius = max(16.0, drawn * 0.5 + 4.0);
  int corner = gl_VertexID % 6;
  vec2 unit = vec2(
    corner == 1 || corner == 4 || corner == 5 ? 1.0 : -1.0,
    corner == 2 || corner == 3 || corner == 5 ? 1.0 : -1.0
  );
  float extent = radius + 3.0;
  v_local = unit * extent;
  v_radius = radius;
  gl_Position = vec4(anchor.xy + unit * extent * (2.0 / u_viewport) * anchor.w, anchor.z, anchor.w);
}
`

export const RING_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 u_overlay_color;
in vec2 v_local;
in float v_radius;
out vec4 fragColor;
void main() {
  float d = length(v_local);
  float fill = 0.12 * clamp(v_radius - d + 0.5, 0.0, 1.0);
  float stroke = clamp(d - v_radius + 0.5, 0.0, 1.0) * clamp(v_radius + 2.5 - d, 0.0, 1.0);
  float alpha = mix(fill, 0.9, stroke);
  if (alpha <= 0.0) discard;
  fragColor = vec4(u_overlay_color * alpha, alpha);
}
`
