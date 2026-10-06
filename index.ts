import {
    createViewer,
    setViewerConfig,
    PerspectiveCamera,
    BackgroundMode,
    Vector3,
    Color,
    SplatLoader,
    SplatUtils,
} from '@manycore/aholo-viewer';

import { CursorOrbitControls } from './cursor-orbit-controls';

const SPLAT_URL = 'gamelab_logo.sog';

// Create the container and attach it to the page.
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';

const container = document.createElement('div');
container.style.position = 'fixed';
container.style.inset = '0';
container.style.width = '100%';
container.style.height = '100%';
document.body.appendChild(container);

async function createScene() {
    const viewer = createViewer('example-viewer', container, {});
    const camera = new PerspectiveCamera(60, 1, 0.1, 2000);

    const resp = await fetch(SPLAT_URL);
    const buffer = await resp.arrayBuffer();
    const data = await SplatLoader.parseSplatData(
        SplatLoader.SplatFileType.SOG,
        new Uint8Array(buffer),
        SplatLoader.SplatPackType.Compressed,
    );
    const splat = await SplatUtils.createSplat(data);

    // The splat uses -Y up in OpenCV coordinates.
    camera.up.set(0, -1, 0);
    camera.position.set(0, -30, -30);
    camera.lookAt(new Vector3(0, 0, 0));

    viewer.getScene().add(splat);
    viewer.setCamera(camera);
    setViewerConfig(viewer, {
        pipeline: {
            Background: {
                background: {
                    active: BackgroundMode.BasicBackground,
                    basic: {
                        color: new Color(0, 0, 0),
                    },
                },
                ground: {
                    enabled: false,
                },
            },
            Splatting: {
                enabled: true,
            },
            TAA: {
                enabled: false,
            },
        },
    });

    // Coalesced rendering: many pointer events per frame -> one render.
    let renderQueued = false;

    function render() {
        renderQueued = false;
        viewer.render();
    }

    // Called whenever viewer.requestRender() is invoked.
    viewer.requestRenderHandler = function () {
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(render);
    };

    const updateAspect = () => {
        const w = container.clientWidth;
    	const h = container.clientHeight;
    	if (!w || !h) return;

    	camera.aspect = w / h;
    	camera.updateProjectionMatrix();
    	viewer.requestRender();
    };

    new ResizeObserver(updateAspect).observe(container);
    updateAspect();

    // Cursor-position-based orbit around the point the camera looks at.
    const controls = new CursorOrbitControls(
        camera,
        container,
        [0, 0, 0],
        () => viewer.requestRender(),
    );

    // Optional: call controls.dispose() if you ever tear the viewer down.
    void controls;

    // First frame
    viewer.requestRender();
}

createScene();