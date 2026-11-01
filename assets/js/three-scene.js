/**
 * three-scene.js — "Mercury Sheet".
 *
 * ONE displaced plane inside the hero: a slowly churning fbm surface with
 * analytic normals, a single fresnel term and a dark→lime→bone hue ramp.
 * The canvas is absolutely positioned inside .hero, so it scrolls away with
 * the hero and never needs scroll listeners or masks.
 *
 * Shell guarantees (kept from the original file):
 *   - feature-detects WebGL before touching anything,
 *   - renderer + DPR setup with mobile reductions,
 *   - visibilitychange pauses the loop,
 *   - dispose() frees geometry/material/renderer + removes listeners,
 *   - failed init runs the bootstrap below that hides the canvas.
 * Extras: webglcontextlost / webglcontextrestored (Android drops contexts on
 * backgrounding) and a reduced-motion path that renders ONE static frame.
 * An IntersectionObserver on .hero pauses the render loop entirely while the
 * hero is off-screen; a passive scroll listener (store-only) drives a lerped
 * scroll-exit effect (mesh sinks, tilts and dims) consumed inside tick().
 *
 * Noise: inline Ashima Arts / Stefan Gustavson simplex noise (MIT) — no
 * addons, no post-processing, no render targets.
 *
 * Loaded as <script type="module"> after an importmap pins three@0.169.0.
 */
import * as THREE from 'three';

/* Ashima simplex noise — MIT licensed, inlined so we need no addons.
 * Copyright (c) 2011 Ashima Arts / Stefan Gustavson (webgl-noise). */
const SIMPLEX_NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}
`;

const VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform vec2 uMouse;
uniform float uAmp;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vHeight;

${SIMPLEX_NOISE}

float fbm(vec2 p) {
    float f = 0.0;
    f += 0.5333 * snoise(p);
    f += 0.2667 * snoise(p * 2.02);
    f += 0.1333 * snoise(p * 4.05);
    return f;
}

float displace(vec2 p) {
    float h = fbm(p * 0.55 + uTime * 0.06) * uAmp;
    float d = distance(p, uMouse);
    h += sin(d * 3.4 - uTime * 2.2) * exp(-d * 1.15) * 0.35;
    return h;
}

void main() {
    float h = displace(position.xy);
    vec3 p = vec3(position.xy, h);

    // Analytic normals via finite difference (no dFdx extension needed)
    vec2 ex = vec2(0.06, 0.0);
    vec2 ey = vec2(0.0, 0.06);
    vec3 px = vec3(position.xy + ex, displace(position.xy + ex));
    vec3 py = vec3(position.xy + ey, displace(position.xy + ey));
    vec3 nrm = normalize(cross(px - p, py - p));

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    vNormal = normalize(normalMatrix * nrm);
    vViewDir = normalize(-mvPosition.xyz);
    vHeight = h;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uDim;
uniform vec3 uDark;
uniform vec3 uLime;
uniform vec3 uBone;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vHeight;

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    // One fresnel term
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);

    // One hue ramp: uDark -> uLime -> uBone
    float t = fract(fres * 0.85 + vHeight * 0.35 + uTime * 0.015);
    vec3 ramp = mix(uDark, uLime, smoothstep(0.0, 0.5, t));
    ramp = mix(ramp, uBone, smoothstep(0.5, 1.0, t));

    // Opaque base ≈ page background so the sheet melts into the page
    vec3 color = uDark + (ramp * 0.28 + fres * uLime * 0.55) * uDim;
    gl_FragColor = vec4(color, 1.0);
}
`;

/** Clamp helper. */
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** True when the device is mobile / coarse-pointer (drives perf reductions). */
function isMobileLike() {
    return (
        window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(max-width: 768px)').matches
    );
}

/** Feature-detect WebGL via an offscreen canvas. */
function webglSupported() {
    try {
        const canvas = document.createElement('canvas');
        return !!(
            window.WebGLRenderingContext &&
            (canvas.getContext('webgl2') || canvas.getContext('webgl'))
        );
    } catch (err) {
        return false;
    }
}

/** Respect the user's reduced-motion preference. */
function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

class PortfolioScene {
    constructor() {
        this.canvas = document.getElementById('bg-canvas');
        this.mobile = isMobileLike();
        this.reduced = prefersReducedMotion();
        this.clock = new THREE.Clock();
        this.mouse = new THREE.Vector2(0, 0);
        this.mouseTarget = new THREE.Vector2(0, 0);
        this.running = false;
        this.rafId = null;
        this.contextLost = false;
        this.halfW = 6;
        this.halfH = 4;
        // Hero exit state: the scroll listener only STORES scrollY (no DOM
        // reads); tick() consumes it through a 0.08 lerp, so re-entry never
        // pops and the loop is fully stopped while the hero is off-screen.
        this.heroEl = null;
        this.heroVisible = true;
        this.heroHeight = 0;
        this.scrollY = window.scrollY;
        this.scrollProgress = 0;
        this.baseRotZ = 0.12;
        this.baseDim = 1.0; // set from the mobile base in buildSheet()
        this._onResize = this.onResize.bind(this);
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onVisibility = this.onVisibility.bind(this);
        this._onContextLost = this.onContextLost.bind(this);
        this._onContextRestored = this.onContextRestored.bind(this);
        this._onScroll = this.onScroll.bind(this);
        this._onHeroVisibility = this.onHeroVisibility.bind(this);
        this._tick = this.tick.bind(this);
    }

    /** Entry point. Returns false if the scene could not be created. */
    init() {
        if (!this.canvas) return false;
        if (!webglSupported()) return false;

        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: window.devicePixelRatio === 1,
                alpha: true,
                powerPreference: 'high-performance',
            });
        } catch (err) {
            console.warn('WebGL renderer unavailable; skipping Mercury Sheet.', err);
            return false;
        }

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        this.camera.position.set(0, 0, this.mobile ? 9 : 7.5);

        this.buildSheet();
        this.resize();
        this.attachListeners();

        if (this.reduced) {
            // One static frame at uTime = 0 — never a loop.
            this.uniforms.uTime.value = 0;
            this.renderFrame();
        } else {
            this.start();
        }
        return true;
    }

    /** Perf budgets: mobile caps DPR at 1, desktop at 1.5 (never above 2). */
    pixelRatio() {
        const dpr = window.devicePixelRatio || 1;
        return Math.min(dpr, isMobileLike() ? 1 : 1.5, 2);
    }

    /** The single mesh: a 7×7 displaced plane, right-of-centre in the hero. */
    buildSheet() {
        const segments = this.mobile ? 96 : 160;
        this.geometry = new THREE.PlaneGeometry(7, 7, segments, segments);
        this.baseDim = this.mobile ? 0.6 : 1.0;
        this.uniforms = {
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2(0, 0) },
            uAmp: { value: this.mobile ? 0.7 : 1.1 },
            uDim: { value: this.baseDim },
            uDark: { value: new THREE.Color(0x050505) },
            uLime: { value: new THREE.Color(0xc8ff2f) },
            uBone: { value: new THREE.Color(0xe9e6dc) },
        };
        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            transparent: false,
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.rotation.set(-0.35, 0, 0.12);
        this.mesh.position.x = this.mobile ? 0 : 2.2;
        this.scene.add(this.mesh);
    }

    /* ------------------------------------------------------------------
     * Listeners
     * ------------------------------------------------------------------ */
    attachListeners() {
        window.addEventListener('resize', this._onResize);
        document.addEventListener('visibilitychange', this._onVisibility);
        // WebGL contexts are dropped when Android backgrounds the tab
        this.canvas.addEventListener('webglcontextlost', this._onContextLost, false);
        this.canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
        // Mouse ripple only — never touchmove/pointerdown (canvas is pointer-events:none)
        if (!this.mobile && !this.reduced) {
            window.addEventListener('mousemove', this._onMouseMove, { passive: true });
        }
        // Hero exit: passive scroll listener only STORES scrollY (no DOM reads
        // here); tick() consumes it. IntersectionObserver pauses the loop
        // entirely once the hero is off-screen (reduced-motion never loops).
        window.addEventListener('scroll', this._onScroll, { passive: true });
        if (!this.reduced && 'IntersectionObserver' in window) {
            this.heroEl = document.querySelector('.hero');
            if (this.heroEl) {
                this.heroHeight = this.heroEl.offsetHeight;
                this.heroObserver = new IntersectionObserver(this._onHeroVisibility, {
                    threshold: 0,
                    rootMargin: '0px',
                });
                this.heroObserver.observe(this.heroEl);
            }
        }
    }

    /** Scroll handler: store-only (passive, no DOM reads) for the tick loop. */
    onScroll() {
        this.scrollY = window.scrollY;
    }

    /** Pause the render loop when the hero is fully off-screen; resume on re-entry. */
    onHeroVisibility(entries) {
        const entry = entries[entries.length - 1];
        this.heroVisible = !!entry && entry.isIntersecting;
        if (this.heroVisible) this.start(); // start() re-checks hidden/contextLost
        else this.stop();
    }

    onMouseMove(e) {
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = -((e.clientY / window.innerHeight) * 2 - 1);
        // Project the pointer into plane-local space (approximate, decorative)
        this.mouseTarget.x = nx * this.halfW - this.mesh.position.x;
        this.mouseTarget.y = clamp(ny * this.halfH, -4.5, 4.5);
    }

    onResize() {
        if (!this.renderer) return;
        this.resize();
    }

    resize() {
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        if (!w || !h) return;

        this.renderer.setPixelRatio(this.pixelRatio());
        this.renderer.setSize(w, h, false); // CSS owns the element size (inset:0)
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();

        // World extents at the plane's depth — used to map the mouse ripple
        const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
        this.halfH = halfH;
        this.halfW = halfH * this.camera.aspect;

        // Cache the hero height for the scroll-exit math (read here, not in tick)
        if (this.heroEl) this.heroHeight = this.heroEl.offsetHeight;

        if (this.reduced) this.renderFrame();
    }

    onVisibility() {
        if (this.reduced) return;
        if (document.hidden) this.stop();
        else this.start();
    }

    onContextLost(e) {
        e.preventDefault(); // required for the context to be restorable
        this.contextLost = true;
        this.stop();
    }

    onContextRestored() {
        this.contextLost = false;
        if (this.reduced) this.renderFrame();
        else this.start();
    }

    /* ------------------------------------------------------------------
     * Render loop
     * ------------------------------------------------------------------ */
    start() {
        // heroVisible gates every start path (init, visibilitychange, context
        // restore, observer): no renders while the hero is fully off-screen.
        if (this.running || this.contextLost || document.hidden || !this.heroVisible) return;
        this.running = true;
        this.clock.getDelta();
        this._tick();
    }

    stop() {
        this.running = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    renderFrame() {
        if (!this.renderer || this.contextLost) return;
        this.renderer.render(this.scene, this.camera);
    }

    /** Scroll-exit: sink, tilt and dim the sheet as the hero leaves the
     * viewport. heroProgress is lerped at 0.08 so re-entry resumes without a
     * visual pop (the loop restarts while progress is still ≈1 and eases back). */
    applyScrollExit() {
        const height = this.heroHeight || window.innerHeight;
        const target = clamp(this.scrollY / height, 0, 1);
        this.scrollProgress += (target - this.scrollProgress) * 0.08;
        const p = this.scrollProgress;
        this.mesh.position.y = -p * 0.6;
        this.mesh.rotation.z = this.baseRotZ + p * 0.05;
        this.uniforms.uDim.value = this.baseDim * (1 - p * 0.8);
    }

    tick() {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this._tick); // bound in constructor

        this.uniforms.uTime.value = this.clock.getElapsedTime();
        this.mouse.lerp(this.mouseTarget, 0.05);
        this.uniforms.uMouse.value.copy(this.mouse);
        this.applyScrollExit();

        this.renderFrame();
    }

    /** Free GPU resources on teardown. */
    dispose() {
        this.stop();
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('scroll', this._onScroll);
        document.removeEventListener('visibilitychange', this._onVisibility);
        if (this.heroObserver) {
            this.heroObserver.disconnect();
            this.heroObserver = null;
        }
        if (this.canvas) {
            this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
            this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
        }
        if (this.geometry) this.geometry.dispose();
        if (this.material) this.material.dispose();
        if (this.renderer) this.renderer.dispose();
    }
}

// Bootstrap
const portfolioScene = new PortfolioScene();
const ok = portfolioScene.init();
if (!ok) {
    // Graceful fallback: hide the (empty) canvas; .hero::before provides the
    // static lime-radial + grain fill so the hero never looks empty.
    const canvas = document.getElementById('bg-canvas');
    if (canvas) canvas.style.display = 'none';
    portfolioScene.dispose();
}
