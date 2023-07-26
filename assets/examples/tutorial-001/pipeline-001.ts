import {
    _decorator,
    Component,
    gfx,
    renderer,
    rendering,
} from 'cc';
import { getWindowInfo, WindowInfo } from '../pipeline-data';
const { ccclass } = _decorator;

class HelloWorldPipeline implements rendering.PipelineBuilder {
    // interface
    public setup (cameras: renderer.scene.Camera[], ppl: rendering.BasicPipeline): void {
        for (let i = 0; i < cameras.length; i++) {
            const camera = cameras[i];
            if (camera.scene === null || camera.window === null) {
                continue;
            }
            const info = this.prepareCameraResources(ppl, camera);
            this.buildForward(ppl, camera, info.id, info.width, info.height);
        }
    }
    private prepareCameraResources (
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera): WindowInfo {
        const info = getWindowInfo(camera);
        if (info.width === 0 && info.height === 0) {
            info.width = camera.window.width;
            info.height = camera.window.height;
            this.initCameraResources(ppl, camera, info.id, info.width, info.height);
        } else if (
            info.framebuffer !== camera.window.framebuffer ||
            info.width !== camera.window.width ||
            info.height !== camera.window.height) {
            info.framebuffer = camera.window.framebuffer;
            info.width = camera.window.width;
            info.height = camera.window.height;
            this.updateCameraResources(ppl, camera, info.id, info.width, info.height);
        }
        return info;
    }
    private initCameraResources (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        ppl.addRenderWindow(`Color${id}`, gfx.Format.BGRA8, width, height, camera.window);
        ppl.addDepthStencil(`DepthStencil${id}`, gfx.Format.DEPTH_STENCIL, width, height);
    }
    private updateCameraResources (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        ppl.updateRenderWindow(`Color${id}`, camera.window);
        ppl.updateDepthStencil(`DepthStencil${id}`, width, height);
    }
    private buildForward (
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera,
        id: number,
        width: number,
        height: number): void {
        // Camera
        this._clearColor.x = camera.clearColor.x;
        this._clearColor.y = camera.clearColor.y;
        this._clearColor.z = camera.clearColor.z;
        this._clearColor.w = camera.clearColor.w;

        // Viewport
        this._viewport.left = camera.viewport.x * width;
        this._viewport.top = camera.viewport.y * height;
        this._viewport.width = camera.viewport.z * width;
        this._viewport.height = camera.viewport.w * height;

        // Forward Lighting
        const pass = ppl.addRenderPass(width, height, 'default');
        pass.setViewport(this._viewport);
        if (camera.clearFlag & gfx.ClearFlagBit.COLOR) {
            pass.addRenderTarget(`Color${id}`, gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, this._clearColor);
        } else {
            pass.addRenderTarget(`Color${id}`, gfx.LoadOp.LOAD);
        }
        if (camera.clearFlag & gfx.ClearFlagBit.DEPTH_STENCIL) {
            pass.addDepthStencil(
                `DepthStencil${id}`,
                gfx.LoadOp.CLEAR,
                gfx.StoreOp.STORE,
                camera.clearDepth,
                camera.clearStencil,
                camera.clearFlag & gfx.ClearFlagBit.DEPTH_STENCIL);
        } else {
            pass.addDepthStencil(`DepthStencil${id}`, gfx.LoadOp.LOAD);
        }
        pass.addQueue(rendering.QueueHint.NONE)
            .addSceneOfCamera(
                camera,
                new rendering.LightInfo(),
                rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK);
        pass.addQueue(rendering.QueueHint.BLEND)
            .addSceneOfCamera(
                camera,
                new rendering.LightInfo(),
                rendering.SceneFlags.BLEND);
    }
    readonly _clearColor = new gfx.Color(0, 0, 0, 1);
    readonly _viewport = new gfx.Viewport();
}

rendering.setCustomPipeline('MyPipeline', new HelloWorldPipeline());

@ccclass('pipeline_001')
export class pipeline_001 extends Component {
    start() {
        // noop
    }

    update(deltaTime: number) {
        // noop
    }
}
