import {
    _decorator,
    Component,
    gfx,
    renderer,
    rendering,
} from 'cc';
import { getWindowInfo, WindowInfo } from '../pipeline-data';
const { ccclass } = _decorator;

// implement a custom pipeline
class HelloWorldPipeline implements rendering.PipelineBuilder {
    // implemenation of rendering.PipelineBuilder interface
    public setup (cameras: renderer.scene.Camera[], ppl: rendering.BasicPipeline): void {
        for (let i = 0; i < cameras.length; i++) {
            const camera = cameras[i];
            // skip invalid camera
            if (camera.scene === null || camera.window === null) {
                continue;
            }
            // prepae camera resources
            const info = this.prepareCameraResources(ppl, camera);

            // build forward lighting for editor or game view
            this.buildForward(ppl, camera, info.id, info.width, info.height);
        }
    }
    // internal methods
    private prepareCameraResources (
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera): WindowInfo {
        // get window info
        const info = getWindowInfo(camera);
        // check if camera resources are initialized
        if (info.width === 0 && info.height === 0) {
            info.width = camera.window.width;
            info.height = camera.window.height;
            this.initCameraResources(ppl, camera, info.id, info.width, info.height);
        } else if (
            info.framebuffer !== camera.window.framebuffer || // we need to check framebuffer because window may be reused
            info.width !== camera.window.width || // we need to check width and height because window may be resized
            info.height !== camera.window.height) {
            // resized or invalidated
            info.framebuffer = camera.window.framebuffer; // update framebuffer
            info.width = camera.window.width; // update width
            info.height = camera.window.height; // update height
            // update resources
            this.updateCameraResources(ppl, camera, info.id, info.width, info.height);
        }
        // return window info
        return info;
    }
    // all resource can be initialized here
    private initCameraResources (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        ppl.addRenderWindow(`Color${id}`, gfx.Format.BGRA8, width, height, camera.window);
        ppl.addDepthStencil(`DepthStencil${id}`, gfx.Format.DEPTH_STENCIL, width, height);
    }
    // all resource can be updated here
    private updateCameraResources (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        ppl.updateRenderWindow(`Color${id}`, camera.window);
        ppl.updateDepthStencil(`DepthStencil${id}`, width, height);
    }
    // build forward lighting pipeline
    private buildForward (
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera,
        id: number, // window id
        width: number,
        height: number): void {
        // prepare camera clear color
        this._clearColor.x = camera.clearColor.x;
        this._clearColor.y = camera.clearColor.y;
        this._clearColor.z = camera.clearColor.z;
        this._clearColor.w = camera.clearColor.w;

        // prepare camera viewport
        this._viewport.left = camera.viewport.x * width;
        this._viewport.top = camera.viewport.y * height;
        this._viewport.width = camera.viewport.z * width;
        this._viewport.height = camera.viewport.w * height;

        // Forward Lighting
        const pass = ppl.addRenderPass(width, height, 'default');
        // set viewport
        pass.setViewport(this._viewport);
        // bind output render target
        if (camera.clearFlag & gfx.ClearFlagBit.COLOR) {
            pass.addRenderTarget(`Color${id}`, gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, this._clearColor);
        } else {
            pass.addRenderTarget(`Color${id}`, gfx.LoadOp.LOAD);
        }
        // bind depth stencil buffer
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
        // add opaque and mask queue
        pass.addQueue(rendering.QueueHint.NONE)
            .addSceneOfCamera(
                camera,
                new rendering.LightInfo(),
                rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK);
        // add transparent queue
        pass.addQueue(rendering.QueueHint.BLEND)
            .addSceneOfCamera(
                camera,
                new rendering.LightInfo(),
                rendering.SceneFlags.BLEND);
    }
    // internal cached resources
    readonly _clearColor = new gfx.Color(0, 0, 0, 1);
    readonly _viewport = new gfx.Viewport();
}

// register pipeline
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
