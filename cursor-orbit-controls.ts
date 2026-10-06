import { PerspectiveCamera, Vector3 } from '@manycore/aholo-viewer';

// ===== TUNABLE CONSTANTS =====
const MAX_YAW_DEGREES = 60;
const MAX_PITCH_DEGREES = 25;
const ROTATE_SENSITIVITY = 1;   // 1 = exact 1:1 tracking
const CENTER_DEAD_ZONE = 0;     // 0..1, mouse only
const YAW_SIGN = 1;             // flip to -1 if left/right feels reversed
const PITCH_SIGN = 1;           // flip to -1 if up/down feels reversed
const WHEEL_ZOOM_SPEED = 0.001; // set to 0 to disable wheel zoom

// Touch
const TOUCH_DRAG_SPEED = 1;     // 1 = dragging half the screen sweeps the full range; negative inverts
const PINCH_ZOOM = true;        // set to false to disable pinch zoom
// =============================

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class CursorOrbitControls {
    private camera: PerspectiveCamera;
    private el: HTMLElement;
    private onChange: () => void;

    private target: [number, number, number];
    private radius: number;
    private baseYaw: number;
    private basePitch: number;

    private normX = 0;
    private normY = 0;

    private pointers = new Map<number, { x: number; y: number }>();
    private lastPinchDist = 0;

    constructor(
        camera: PerspectiveCamera,
        el: HTMLElement,
        target: [number, number, number],
        onChange: () => void,
    ) {
        this.camera = camera;
        this.el = el;
        this.target = target;
        this.onChange = onChange;

        const dx = camera.position.x - target[0];
        const dy = -(camera.position.y - target[1]);
        const dz = camera.position.z - target[2];

        this.radius = Math.hypot(dx, dy, dz);
        this.baseYaw = Math.atan2(dx, dz);
        this.basePitch = Math.asin(clamp(dy / this.radius, -1, 1));

        this.camera.up.set(0, -1, 0);

        // Stop the browser from scrolling/zooming the page on touch.
        el.style.touchAction = 'none';

        el.addEventListener('pointerdown', this.onPointerDown);
        el.addEventListener('pointermove', this.onPointerMove);
        el.addEventListener('pointerup', this.onPointerEnd);
        el.addEventListener('pointercancel', this.onPointerEnd);
        el.addEventListener('wheel', this.onWheel, { passive: false });
    }

    dispose() {
        this.el.removeEventListener('pointerdown', this.onPointerDown);
        this.el.removeEventListener('pointermove', this.onPointerMove);
        this.el.removeEventListener('pointerup', this.onPointerEnd);
        this.el.removeEventListener('pointercancel', this.onPointerEnd);
        this.el.removeEventListener('wheel', this.onWheel);
    }

    private onPointerDown = (e: PointerEvent) => {
        if (e.pointerType !== 'touch') return;

        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try {
            this.el.setPointerCapture(e.pointerId);
        } catch {
            // Capture is a nicety, not a requirement.
        }

        if (this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values()];
            this.lastPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        }
    };

    private onPointerMove = (e: PointerEvent) => {
        if (e.pointerType === 'touch') {
            this.onTouchMove(e);
            return;
        }

        // Mouse: absolute cursor position -> absolute view angle
        const rect = this.el.getBoundingClientRect();
        let nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        let ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;

        if (Math.abs(nx) < CENTER_DEAD_ZONE) nx = 0;
        if (Math.abs(ny) < CENTER_DEAD_ZONE) ny = 0;

        this.normX = clamp(nx, -1, 1);
        this.normY = clamp(ny, -1, 1);
        this.apply();
    };

    private onTouchMove(e: PointerEvent) {
        const prev = this.pointers.get(e.pointerId);
        if (!prev) return;

        const cur = { x: e.clientX, y: e.clientY };
        this.pointers.set(e.pointerId, cur);

        if (this.pointers.size === 1) {
            // One finger: drag relative to where the view already is.
            const rect = this.el.getBoundingClientRect();
            this.normX = clamp(this.normX + ((cur.x - prev.x) / (rect.width / 2)) * TOUCH_DRAG_SPEED, -1, 1);
            this.normY = clamp(this.normY + ((cur.y - prev.y) / (rect.height / 2)) * TOUCH_DRAG_SPEED, -1, 1);
            this.apply();
        } else if (this.pointers.size === 2 && PINCH_ZOOM) {
            const [a, b] = [...this.pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (this.lastPinchDist > 0 && dist > 0) {
                this.radius = Math.max(0.05, this.radius * (this.lastPinchDist / dist));
                this.apply();
            }
            this.lastPinchDist = dist;
        }
    }

    private onPointerEnd = (e: PointerEvent) => {
        this.pointers.delete(e.pointerId);
        if (this.pointers.size < 2) this.lastPinchDist = 0;
    };

    private onWheel = (e: WheelEvent) => {
        if (WHEEL_ZOOM_SPEED === 0) return;
        e.preventDefault();
        this.radius = Math.max(0.05, this.radius * (1 + e.deltaY * WHEEL_ZOOM_SPEED));
        this.apply();
    };

    private apply() {
        const yawOffset = -this.normX * MAX_YAW_DEGREES * ROTATE_SENSITIVITY * YAW_SIGN * DEG;
        const pitchOffset = -this.normY * MAX_PITCH_DEGREES * ROTATE_SENSITIVITY * PITCH_SIGN * DEG;

        const yaw = this.baseYaw + yawOffset;
        const pitch = clamp(this.basePitch + pitchOffset, -89 * DEG, 89 * DEG);

        const cp = Math.cos(pitch);
        const x = this.radius * cp * Math.sin(yaw);
        const y = this.radius * Math.sin(pitch);
        const z = this.radius * cp * Math.cos(yaw);

        const [tx, ty, tz] = this.target;
        this.camera.position.set(tx + x, ty - y, tz + z);
        this.camera.lookAt(new Vector3(tx, ty, tz));

        this.onChange();
    }
}