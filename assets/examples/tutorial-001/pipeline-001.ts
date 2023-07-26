import {
    _decorator,
    Component,
    gfx,
    assert,
    renderer,
    rendering,
} from 'cc';
const { ccclass, property } = _decorator;

class WindowInfo {
    constructor (id: number, width: number, height: number) {
        this.id = id;
        this.width = width;
        this.height = height;
    }
    id = 0xFFFFFFFF;
    width = 0;
    height = 0;
}

class HelloWorldPipeline implements rendering.PipelineBuilder {
    // interface
    public setup (cameras: renderer.scene.Camera[], ppl: rendering.BasicPipeline): void {
        for (let i = 0; i < cameras.length; i++) {
            const camera = cameras[i];
            if (camera.scene === null || camera.window === null) {
                continue;
            }
            const info = this.prepareGameCamera(ppl, camera);
            this.buildForward(ppl, camera,
                info.id, info.width, info.height);
        }
    }
    // implementation
    private prepareGameCamera (
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera): WindowInfo {
        let info = this._windows.get(camera.window);
        if (info !== undefined) {
            let width = camera.window.width;
            let height = camera.window.height;
            if (width === 0) {
                width = 1;
            }
            if (height === 0) {
                height = 1;
            }
            if (info.width === width && info.height === height) {
                return info;
            }
            info.width = width;
            info.height = height;
            this.updateGameCamera(ppl, camera, info.id, info.width, info.height);
            return info;
        }
        const id = this._windows.size;
        info = new WindowInfo(
            id,
            camera.window.width ? camera.window.width : 1,
            camera.window.height ? camera.window.height : 1,
        );
        this.initGameCamera(ppl, camera, info.id, info.width, info.height);
        this._windows.set(camera.window, info);
        return info;
    }
    private initGameCamera (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        ppl.addRenderWindow(`Color${id}`, gfx.Format.BGRA8, width, height, camera.window);
        ppl.addDepthStencil(`DepthStencil${id}`, gfx.Format.DEPTH_STENCIL, width, height);
    }
    private updateGameCamera (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        ppl.updateRenderWindow(`Color${id}`, camera.window);
        ppl.updateDepthStencil(`DepthStencil${id}`, width, height);
    }
    private buildForward (
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera,
        id: number,
        width: number,
        height: number): void {
        console.log('buildForward');
        assert(camera.scene !== null);
        if (camera.scene === null) {
            return;
        }

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
        {
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
                    camera.clearStencil);
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
    }
    readonly _windows = new Map<any, WindowInfo>();
    readonly _clearColor = new gfx.Color();
    readonly _viewport = new gfx.Viewport();
}

rendering.setCustomPipeline('MyPipeline', new HelloWorldPipeline());

@ccclass('pipeline_001')
export class pipeline_001 extends Component {
    start() {

    }

    update(deltaTime: number) {
        
    }
}
