/**
 * three-scene.js — Single fixed WebGL canvas with three decorative "stations"
 * (Hero / Skills / Projects). Purely decorative (aria-hidden); never the sole
 * carrier of information. Degrades gracefully: no WebGL, reduced-motion, or a
 * failed renderer all leave the site as a clean static gradient/grid portfolio.
 *
 * Loaded as <script type="module"> after an importmap pins three@0.169.0.
 */
import * as THREE from 'three';

const ACCENT = 0x00f2ff;

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
        this.clock = new THREE.Clock();
        this.mouse = new THREE.Vector2(0, 0);
        this.mouseTarget = new THREE.Vector2(0, 0);
        this.running = false;
        this.rafId = null;
        this.stations = {};
        this.stationSections = [
            { id: 'home', key: 'hero' },
            { id: 'stack', key: 'skills' },
            { id: 'work', key: 'projects' },
        ];
        this._onResize = this.onResize.bind(this);
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onVisibility = this.onVisibility.bind(this);
        this._tick = this.tick.bind(this);
        this._onScroll = this.onScroll.bind(this);
    }

    /** Entry point. Returns false if the scene could not be created. */
    init() {
        if (!this.canvas) return false;
        if (!webglSupported()) return false;
        if (prefersReducedMotion()) return false;

        try {
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: window.devicePixelRatio === 1,
                alpha: true,
                powerPreference: 'high-performance',
            });
        } catch (err) {
            console.warn('WebGL renderer unavailable; skipping 3D scene.', err);
            return false;
        }

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            55,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        this.camera.position.set(0, 0, 12);

        this.buildStations();
        this.attachListeners();
        this.onScroll();
        this.start();
        return true;
    }

    /** Build all three stations as object groups. */
    buildStations() {
        this.stations.hero = this.buildHeroStation();
        this.stations.skills = this.buildSkillsStation();
        this.stations.projects = this.buildProjectsStation();
        Object.values(this.stations).forEach((group) => {
            group.visible = false;
            this.scene.add(group);
        });
    }

    /* ------------------------------------------------------------------
     * Station 1 — Hero: edge-lit wireframe code blocks, node network,
     * additive particle field.
     * ------------------------------------------------------------------ */
    buildHeroStation() {
        const group = new THREE.Group();

        // Floating edge-lit wireframe code blocks
        const blockCount = this.mobile ? 3 : 5;
        for (let i = 0; i < blockCount; i++) {
            const w = 1.4 + Math.random() * 1.2;
            const h = 0.8 + Math.random() * 0.7;
            const block = this.createCodeBlock(w, h);
            block.position.set(
                2.2 + Math.random() * 3.5,
                (Math.random() - 0.5) * 4,
                -1 + Math.random() * 2
            );
            block.rotation.z = (Math.random() - 0.5) * 0.3;
            block.userData.spin = (Math.random() - 0.5) * 0.15;
            block.userData.bobOffset = Math.random() * Math.PI * 2;
            block.userData.baseY = block.position.y;
            group.add(block);
        }

        // Node network (icosahedron nodes + connecting lines)
        group.add(this.createNodeNetwork());

        // Additive particle field
        group.add(this.createParticleField());

        return group;
    }

    /** A wireframe "code block": glassy faces + glowing cyan edges. */
    createCodeBlock(width, height) {
        const block = new THREE.Group();
        const depth = 0.35;
        const geo = new THREE.BoxGeometry(width, height, depth);

        const fill = new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({
                color: 0x061014,
                transparent: true,
                opacity: 0.35,
            })
        );
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 })
        );
        block.add(fill, edges);
        return block;
    }

    /** A constellation of icosahedron nodes joined by LineSegments. */
    createNodeNetwork() {
        const net = new THREE.Group();
        const nodeCount = this.mobile ? 8 : 12;
        const positions = [];
        for (let i = 0; i < nodeCount; i++) {
            const p = new THREE.Vector3(
                2 + (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 5,
                -1 + (Math.random() - 0.5) * 4
            );
            positions.push(p);
            const node = new THREE.Mesh(
                new THREE.IcosahedronGeometry(0.09, 0),
                new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.85 })
            );
            node.position.copy(p);
            net.add(node);
        }
        // Connect each node to its two nearest neighbours
        const segs = [];
        positions.forEach((p, i) => {
            const others = positions
                .map((q, j) => ({ q, j, d: p.distanceTo(q) }))
                .filter((o) => o.j !== i)
                .sort((a, b) => a.d - b.d)
                .slice(0, 2);
            others.forEach((o) => segs.push(p.x, p.y, p.z, o.q.x, o.q.y, o.q.z));
        });
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
        net.add(
            new THREE.LineSegments(
                lineGeo,
                new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.25 })
            )
        );
        return net;
    }

    /** Wide additive particle field. */
    createParticleField() {
        const count = this.mobile ? 400 : 2000;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 30;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: ACCENT,
            size: 0.04,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        return new THREE.Points(geo, mat);
    }

    /* ------------------------------------------------------------------
     * Station 2 — Skills constellation: 4 hub nodes (skill groups) + 18 leaf
     * nodes (the 5/5/5/3 skills), hub→leaf edges, flying into place on enter.
     * DOM skill lists remain the accessible source of truth (canvas is
     * aria-hidden and purely decorative).
     * ------------------------------------------------------------------ */
    buildSkillsStation() {
        const group = new THREE.Group();
        const leavesPerHub = [5, 5, 5, 3]; // matches the four skill groups
        const leafNodes = [];

        // Hub positions spread horizontally
        const hubXs = [-4.5, -1.5, 1.5, 4.5];
        leavesPerHub.forEach((leafCount, hi) => {
            const hubPos = new THREE.Vector3(hubXs[hi], 0, 0);
            const hub = this.createGlowNode(0.28);
            hub.position.copy(hubPos);
            group.add(hub);

            const segs = [];
            for (let li = 0; li < leafCount; li++) {
                const angle = (li / leafCount) * Math.PI * 2;
                const radius = 1.1 + Math.random() * 0.4;
                const target = new THREE.Vector3(
                    hubPos.x + Math.cos(angle) * radius,
                    hubPos.y + Math.sin(angle) * radius * 0.8,
                    (Math.random() - 0.5) * 1.2
                );
                const leaf = this.createGlowNode(0.11);
                leaf.position.copy(target);
                leaf.userData.target = target.clone();
                // Scattered start position for the fly-in
                leaf.userData.start = new THREE.Vector3(
                    target.x + (Math.random() - 0.5) * 8,
                    target.y + (Math.random() - 0.5) * 8,
                    -6 + Math.random() * 4
                );
                leaf.position.copy(leaf.userData.start);
                leafNodes.push(leaf);
                group.add(leaf);
                segs.push(hubPos.x, hubPos.y, hubPos.z, target.x, target.y, target.z);
            }

            const lineGeo = new THREE.BufferGeometry();
            lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
            group.add(
                new THREE.LineSegments(
                    lineGeo,
                    new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.28 })
                )
            );
        });

        group.userData.leafNodes = leafNodes;
        group.userData.fly = { active: false, t: 0 };
        return group;
    }

    /** Small glowing icosahedron node. */
    createGlowNode(radius) {
        return new THREE.Mesh(
            new THREE.IcosahedronGeometry(radius, 0),
            new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 })
        );
    }

    /* ------------------------------------------------------------------
     * Station 3 — Projects glass-panel frames (populated in a later task).
     * ------------------------------------------------------------------ */
    buildProjectsStation() {
        // TODO(task 7): floating glass-panel frames
        return new THREE.Group();
    }

    /* ------------------------------------------------------------------
     * Listeners
     * ------------------------------------------------------------------ */
    attachListeners() {
        window.addEventListener('resize', this._onResize);
        document.addEventListener('visibilitychange', this._onVisibility);
        window.addEventListener('scroll', this._onScroll, { passive: true });
        // Mouse parallax only — never touchmove/pointerdown (canvas is pointer-events:none).
        if (!this.mobile) {
            window.addEventListener('mousemove', this._onMouseMove, { passive: true });
        }
    }

    onMouseMove(e) {
        this.mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
    }

    onResize() {
        if (!this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onVisibility() {
        if (document.hidden) this.stop();
        else this.start();
    }

    /** Fade/scale stations based on how centered their section is in the viewport. */
    onScroll() {
        const vh = window.innerHeight;
        this.stationSections.forEach(({ id, key }) => {
            const el = document.getElementById(id);
            const group = this.stations[key];
            if (!el || !group) return;
            const rect = el.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const dist = Math.abs(center - vh / 2);
            const fade = clamp(1 - dist / (vh * 0.9), 0, 1);
            group.visible = fade > 0.02;
            if (group.userData.fly && fade > 0.02) group.userData.fly.active = true;
            this.setGroupOpacity(group, fade);
            const s = 0.85 + fade * 0.15;
            group.scale.setScalar(s);
        });
    }

    /** Recursively set material opacity = baseOpacity * fade. */
    setGroupOpacity(obj, fade) {
        obj.traverse((child) => {
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach((m) => {
                    if (m.userData.baseOpacity === undefined) {
                        m.userData.baseOpacity = m.opacity;
                    }
                    m.opacity = m.userData.baseOpacity * fade;
                });
            }
        });
    }

    /* ------------------------------------------------------------------
     * Render loop
     * ------------------------------------------------------------------ */
    start() {
        if (this.running) return;
        this.running = true;
        this.clock.getDelta();
        this.tick();
    }

    stop() {
        this.running = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    tick() {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this.tick);
        const t = this.clock.getElapsedTime();
        const dt = Math.min(t - (this._lastT || t), 0.05);
        this._lastT = t;

        // Lerp mouse for smooth parallax
        this.mouse.lerp(this.mouseTarget, 0.05);
        if (!this.mobile) {
            this.camera.position.x = this.mouse.x * 0.6;
            this.camera.position.y = this.mouse.y * 0.4;
        }
        this.camera.lookAt(0, 0, 0);

        // Animate hero station
        const hero = this.stations.hero;
        if (hero && hero.visible) {
            hero.rotation.y = Math.sin(t * 0.1) * 0.15;
            hero.children.forEach((child) => {
                if (child.userData && child.userData.baseY !== undefined) {
                    child.position.y =
                        child.userData.baseY + Math.sin(t * 0.6 + child.userData.bobOffset) * 0.15;
                    child.rotation.y += (child.userData.spin || 0) * 0.01;
                }
            });
        }

        // Animate skills station fly-in
        const skills = this.stations.skills;
        if (skills && skills.visible && skills.userData.fly) {
            const fly = skills.userData.fly;
            if (fly.active && fly.t < 1) {
                fly.t = Math.min(1, fly.t + dt * 0.6);
                const e = 1 - Math.pow(1 - fly.t, 3); // easeOutCubic
                skills.userData.leafNodes.forEach((leaf) => {
                    leaf.position.lerpVectors(leaf.userData.start, leaf.userData.target, e);
                });
            }
            skills.rotation.y = Math.sin(t * 0.15) * 0.08;
        }

        // Animate projects station
        const projects = this.stations.projects;
        if (projects && projects.visible) {
            projects.rotation.y = Math.sin(t * 0.12) * 0.1;
            projects.children.forEach((child) => {
                if (child.userData && child.userData.baseY !== undefined) {
                    child.position.y =
                        child.userData.baseY + Math.sin(t * 0.5 + child.userData.bobOffset) * 0.1;
                }
            });
        }

        this.renderer.render(this.scene, this.camera);
    }

    /** Free GPU resources on teardown. */
    dispose() {
        this.stop();
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('scroll', this._onScroll);
        window.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('visibilitychange', this._onVisibility);
        if (!this.scene) return;
        this.scene.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach((m) => m.dispose());
            }
        });
        if (this.renderer) this.renderer.dispose();
    }
}

// Bootstrap
const portfolioScene = new PortfolioScene();
const ok = portfolioScene.init();
if (!ok) {
    // Graceful fallback: hide the (empty) canvas so no broken element shows.
    const canvas = document.getElementById('bg-canvas');
    if (canvas) canvas.style.display = 'none';
    portfolioScene.dispose();
}
