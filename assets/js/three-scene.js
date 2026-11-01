/**
 * three-scene.js — "Wireframe Command Core".
 *
 * The hero centerpiece for the Wireframe Console theme: a lime wireframe
 * icosahedron ("the core") with vertex dots, a counter-rotating bone inner
 * shell, two tilted orbit rings and a sparse dust field — pure three.js
 * primitives (LineSegments / Points), no shaders, no addons, no post-FX.
 *
 * Interaction model:
 *   - mousemove tilts the whole assembly (lerped, decorative, desktop only)
 *   - the inner shell breathes and counter-rotates against the outer shell
 *   - scrolling out of the hero deconstructs the assembly: it scales down,
 *     spins up and dims (lerped, no pops on re-entry)
 *   - an IntersectionObserver on .hero pauses the loop while the hero is
 *     fully off-screen (the "hero pause" contract from the Motion migration)
 *
 * Shell guarantees (unchanged from the previous scene):
 *   - feature-detects WebGL before touching anything,
 *   - renderer + DPR setup with mobile reductions (DPR cap 1 mobile / 1.5 desktop),
 *   - visibilitychange pauses the loop,
 *   - dispose() frees every geometry/material + removes listeners,
 *   - failed init hides the canvas and lets .hero::before (CSS radial + grain)
 *     carry the hero so it never looks empty,
 *   - reduced motion renders ONE static frame — never a loop,
 *   - webglcontextlost/-restored handled (Android backgrounds drop contexts),
 *   - the passive scroll listener only STORES scrollY; tick() consumes it.
 *
 * Loaded as <script type="module"> after an importmap pins three@0.169.0.
 */
import * as THREE from 'three';

const COLORS = {
    lime: 0xc8ff2f,
    bone: 0xe9e6dc,
};

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

/** Circle outline as a BufferGeometry of segments (for LineLoop rings). */
function ringGeometry(radius, segments = 128) {
    const positions = [];
    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
}

/** Sparse dust cloud in a spherical shell around the core. */
function dustGeometry(count, rMin, rMax) {
    const positions = [];
    for (let i = 0; i < count; i++) {
        // Uniform-ish direction with a bias toward depth (z away from camera)
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const sinU = Math.sqrt(1 - u * u);
        const r = rMin + Math.random() * (rMax - rMin);
        positions.push(r * sinU * Math.cos(phi), r * sinU * Math.sin(phi), r * u * 0.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
}

class PortfolioScene {
    constructor() {
        this.canvas = document.getElementById('bg-canvas');
        this.mobile = isMobileLike();
        this.reduced = prefersReducedMotion();
        this.clock = new THREE.Clock();
        this.running = false;
        this.rafId = null;
        this.contextLost = false;
        this.geometries = [];
        this.materials = [];
        // Hero exit state: the scroll listener only STORES scrollY (no DOM
        // reads); tick() consumes it through a 0.08 lerp, so re-entry never
        // pops and the loop is fully stopped while the hero is off-screen.
        this.heroEl = null;
        this.heroVisible = true;
        this.heroHeight = 0;
        this.scrollY = window.scrollY;
        this.scrollProgress = 0;
        // Pointer tilt state (lerped in tick)
        this.tilt = new THREE.Vector2(0, 0);
        this.tiltTarget = new THREE.Vector2(0, 0);
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
            console.warn('WebGL renderer unavailable; skipping Wireframe Command Core.', err);
            return false;
        }

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        this.camera.position.set(0, 0, 7.5);

        this.buildAssembly();
        this.resize();
        this.attachListeners();

        if (this.reduced) {
            // One static frame at t = 0 — never a loop.
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

    /** Track + register helpers (dispose() sweeps the arrays). */
    geo(g) { this.geometries.push(g); return g; }
    mat(m) { this.materials.push(m); return m; }

    /** The assembly: core shell + vertices + inner shell + rings + dust. */
    buildAssembly() {
        this.group = new THREE.Group();
        this.group.position.x = this.mobile ? 0 : 2.3;
        if (this.mobile) this.group.scale.setScalar(0.78);

        // -- Outer wireframe core (the signature object) --------------------
        const outerGeo = this.geo(new THREE.IcosahedronGeometry(1.7, 0));
        this.outerEdges = new THREE.LineSegments(
            this.geo(new THREE.EdgesGeometry(outerGeo)),
            this.mat(new THREE.LineBasicMaterial({
                color: COLORS.lime,
                transparent: true,
                opacity: 0.9,
            }))
        );
        this.group.add(this.outerEdges);

        // -- Vertex dots on the 12 icosahedron points -----------------------
        this.vertexPoints = new THREE.Points(
            this.geo(outerGeo.clone()),
            this.mat(new THREE.PointsMaterial({
                color: COLORS.lime,
                size: 0.085,
                sizeAttenuation: true,
                transparent: true,
                opacity: 0.95,
            }))
        );
        this.group.add(this.vertexPoints);

        // -- Inner shell: counter-rotating, bone, breathing -----------------
        this.inner = new THREE.LineSegments(
            this.geo(new THREE.EdgesGeometry(
                this.geo(new THREE.IcosahedronGeometry(1.0, 0))
            )),
            this.mat(new THREE.LineBasicMaterial({
                color: COLORS.bone,
                transparent: true,
                opacity: 0.3,
            }))
        );
        this.group.add(this.inner);

        // -- Instrument rings (tilted orbital circles) -----------------------
        this.ringA = new THREE.LineLoop(
            this.geo(ringGeometry(2.35)),
            this.mat(new THREE.LineBasicMaterial({
                color: COLORS.lime,
                transparent: true,
                opacity: 0.22,
            }))
        );
        this.ringA.rotation.set(1.25, 0, 0.35);
        this.ringB = new THREE.LineLoop(
            this.geo(ringGeometry(2.75)),
            this.mat(new THREE.LineBasicMaterial({
                color: COLORS.bone,
                transparent: true,
                opacity: 0.12,
            }))
        );
        this.ringB.rotation.set(1.05, 0.3, -0.5);
        this.group.add(this.ringA, this.ringB);

        // -- Ambient dust (depth, not decoration overload) ------------------
        this.dust = new THREE.Points(
            this.geo(dustGeometry(this.mobile ? 130 : 220, 3.2, 6.5)),
            this.mat(new THREE.PointsMaterial({
                color: COLORS.bone,
                size: 0.035,
                sizeAttenuation: true,
                transparent: true,
                opacity: 0.35,
            }))
        );
        this.scene.add(this.group, this.dust);

        // Opacity registry for scroll-deconstruction dimming.
        this.dimTargets = [
            this.outerEdges.material, this.vertexPoints.material,
            this.inner.material, this.ringA.material, this.ringB.material,
            this.dust.material,
        ];
        this.dimTargets.forEach((m) => { m.userData.baseOpacity = m.opacity; });
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
        // Pointer tilt only — never touch (canvas is pointer-events:none)
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

    /** Pointer tilt target: normalised, clamped — deliberately small. */
    onMouseMove(e) {
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = -((e.clientY / window.innerHeight) * 2 - 1);
        this.tiltTarget.x = clamp(nx * 0.3, -0.3, 0.3);   // yaw
        this.tiltTarget.y = clamp(ny * 0.22, -0.22, 0.22); // pitch
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
        this.clock.getDelta(); // swallow the pause gap
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

    /** Scroll deconstruction: the assembly scales down, spins up and dims as
     * the hero leaves. Progress is lerped at 0.08 so re-entry never pops. */
    applyScrollExit(dt) {
        if (this.reduced) return; // static frame never reacts to scroll
        const height = this.heroHeight || window.innerHeight;
        const target = clamp(this.scrollY / height, 0, 1);
        this.scrollProgress += (target - this.scrollProgress) * 0.08;
        const p = this.scrollProgress;

        this.group.scale.setScalar((this.mobile ? 0.78 : 1) * (1 - p * 0.35));
        this.outerEdges.rotation.y += p * dt * 1.2;  // spin-up
        const dim = (1 - p * 0.85) * (1 - p * 0.85);
        this.dimTargets.forEach((m) => {
            m.opacity = m.userData.baseOpacity * dim;
        });
    }

    tick() {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this._tick); // bound in constructor

        const dt = Math.min(this.clock.getDelta(), 0.1); // clamp tab-switch jumps
        const t = this.clock.getElapsedTime();

        // Constant instrument motion
        this.outerEdges.rotation.y += dt * 0.16;
        this.outerEdges.rotation.x = Math.sin(t * 0.22) * 0.12;
        this.inner.rotation.y -= dt * 0.38;                 // counter-rotation
        this.inner.rotation.z = Math.cos(t * 0.3) * 0.15;
        this.inner.scale.setScalar(1 + Math.sin(t * 0.8) * 0.03); // breathing
        this.ringA.rotation.z += dt * 0.1;
        this.ringB.rotation.z -= dt * 0.07;
        this.dust.rotation.y += dt * 0.02;
        this.vertexPoints.rotation.copy(this.outerEdges.rotation);

        // Pointer tilt (lerped)
        this.tilt.lerp(this.tiltTarget, 0.04);
        this.group.rotation.set(this.tilt.y, this.tilt.x, 0);

        this.applyScrollExit(dt);
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
        this.geometries.forEach((g) => g.dispose());
        this.materials.forEach((m) => m.dispose());
        this.geometries = [];
        this.materials = [];
        if (this.renderer) this.renderer.dispose();
    }
}

// Bootstrap
const portfolioScene = new PortfolioScene();
// Expose for the QA harness (tests/qa.js) — the harness is local-only and is
// the sole consumer; production behaviour is unchanged.
window.__portfolioScene = portfolioScene;

const ok = portfolioScene.init();
if (!ok) {
    // Graceful fallback: hide the (empty) canvas; .hero::before provides the
    // static lime-radial + grain fill so the hero never looks empty.
    const canvas = document.getElementById('bg-canvas');
    if (canvas) canvas.style.display = 'none';
    portfolioScene.dispose();
}
