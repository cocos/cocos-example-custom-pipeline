import {
    _decorator,
    cclegacy,
    Component,
    gfx,
    renderer,
    rendering,
} from 'cc';
import { getWindowInfo, WindowInfo } from '../pipeline-data';
const { ccclass } = _decorator;

// implement a custom pipeline
// 如何实现一个自定义渲染管线
class CsmPipeline implements rendering.PipelineBuilder {
    // implemenation of rendering.PipelineBuilder interface
    // 实现 rendering.PipelineBuilder 接口
    public setup (cameras: renderer.scene.Camera[], ppl: rendering.BasicPipeline): void {
        for (let i = 0; i < cameras.length; i++) {
            const camera = cameras[i];
            // skip invalid camera
            // 跳过无效的摄像机
            if (camera.scene === null || camera.window === null) {
                continue;
            }
            // prepare camera resources
            // 准备摄像机资源
            const info = this.prepareCameraResources(ppl, camera);

            // build forward lighting for editor or game view
            // 为编辑器以及游戏视图构建前向光照管线
            this.buildForward(ppl, camera, info.id, info.width, info.height);
        }
    }
    // internal methods
    // 管线内部方法
    private prepareCameraResources (
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera): WindowInfo {
        // get window info
        // 获取窗口信息
        const info = getWindowInfo(camera);
        // check if camera resources are initialized
        // 检查摄像机资源是否已经初始化
        if (info.width === 0 && info.height === 0) {
            info.width = camera.window.width;
            info.height = camera.window.height;
            this.initCameraResources(ppl, camera, info.id, info.width, info.height);
        } else if (
            // we need to check framebuffer because window may be reused
            // 我们需要检查 framebuffer，因为窗口可能被重用
            info.framebuffer !== camera.window.framebuffer ||
            // we need to check width and height because window may be resized
            // 我们需要检查宽度和高度，因为窗口可能被调整大小
            info.width !== camera.window.width ||
            info.height !== camera.window.height) {
            // resized or invalidated
            // 调整大小或者失效
            info.framebuffer = camera.window.framebuffer; // update framebuffer
            info.width = camera.window.width; // update width
            info.height = camera.window.height; // update height
            // update resources
            // 更新资源
            this.updateCameraResources(ppl, camera, info.id, info.width, info.height);
        }
        // return window info
        // 返回窗口信息
        return info;
    }
    private supportsR32FloatTexture(device: gfx.Device) {
        return (device.getFormatFeatures(gfx.Format.R32F) & (gfx.FormatFeatureBit.RENDER_TARGET | gfx.FormatFeatureBit.SAMPLED_TEXTURE))
            === (gfx.FormatFeatureBit.RENDER_TARGET | gfx.FormatFeatureBit.SAMPLED_TEXTURE)
        && !(device.gfxAPI === gfx.API.WEBGL); // wegl 1  Single-channel float type is not supported under webgl1, so it is excluded
    }

    private initCameraResources (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        // all resource can be initialized here
        // 所有资源可以在这里初始化
        ppl.addRenderWindow(`Color${id}`, gfx.Format.BGRA8, width, height, camera.window);
        ppl.addDepthStencil(`DepthStencil${id}`, gfx.Format.DEPTH_STENCIL, width, height);
        // CSM
        const shadowFormat  = this.supportsR32FloatTexture(ppl.device) ? gfx.Format.R32F : gfx.Format.RGBA8;
        const shadowSize = ppl.pipelineSceneData.shadows.size;
        ppl.addRenderTarget(`ShadowMap${id}`, shadowFormat, shadowSize.x, shadowSize.y);
        ppl.addDepthStencil(`ShadowDepth${id}`, gfx.Format.DEPTH_STENCIL, shadowSize.x, shadowSize.y);
    }
    private updateCameraResources (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        // all resource can be updated here
        // 所有资源可以在这里更新
        ppl.updateRenderWindow(`Color${id}`, camera.window);
        ppl.updateDepthStencil(`DepthStencil${id}`, width, height);
        // CSM
        const shadowSize = ppl.pipelineSceneData.shadows.size;
        ppl.updateRenderTarget(`ShadowMap${id}`, shadowSize.x, shadowSize.y);
        ppl.updateDepthStencil(`ShadowDepth${id}`, shadowSize.x, shadowSize.y);
    }
    private getMainLightViewport (light: renderer.scene.DirectionalLight, w: number, h: number, level: number,
        vp: gfx.Viewport): void {
        if (light.shadowFixedArea || light.csmLevel === renderer.scene.CSMLevel.LEVEL_1) {
            vp.left = 0;
            vp.top = 0;
            vp.width = Math.trunc(w);
            vp.height = Math.trunc(h);
        } else {
            vp.left = Math.trunc(level % 2 * 0.5 * w);
            if (this._flipY > 0) {
                vp.top = Math.trunc((1 - Math.floor(level / 2)) * 0.5 * h);
            } else {
                vp.top = Math.trunc(Math.floor(level / 2) * 0.5 * h);
            }
            vp.width = Math.trunc(0.5 * w);
            vp.height = Math.trunc(0.5 * h);
        }
        vp.left = Math.max(0, vp.left);
        vp.top = Math.max(0, vp.top);
        vp.width = Math.max(1, vp.width);
        vp.height = Math.max(1, vp.height);
    }
    private buildCascadedShadowMapPass (
        ppl: rendering.BasicPipeline,
        id: number,
        light: renderer.scene.DirectionalLight,
        camera: renderer.scene.Camera): void {
        const width = ppl.pipelineSceneData.shadows.size.x;
        const height = ppl.pipelineSceneData.shadows.size.y;
        const pass = ppl.addRenderPass(width, height, 'default');
        pass.addRenderTarget(`ShadowMap${id}`, gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, new gfx.Color(1, 1, 1, 1));
        pass.addDepthStencil(`ShadowDepth${id}`, gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD);
        const csmLevel = ppl.pipelineSceneData.csmSupported ? light.csmLevel : 1;
        for (let level = 0; level !== csmLevel; ++level) {
            this.getMainLightViewport(light, width, height, level, this._viewport);
            const queue = pass.addQueue(rendering.QueueHint.NONE, 'shadow-caster');
            queue.setViewport(this._viewport);
            // queue.addSceneCulledByDirectionalLight(camera,
            //     SceneFlags.OPAQUE | SceneFlags.MASK | SceneFlags.SHADOW_CASTER,
            //     light, level);
            queue.addSceneOfCamera(camera, new rendering.LightInfo(light, level),
                rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK | rendering.SceneFlags.SHADOW_CASTER);
        }
    }
    // build forward lighting pipeline
    // NOTE: this is just a simple example, you can implement your own pipeline here
    // In this example, we have turned off shadowmap in the scene
    // 构建前向光照管线
    // 注意：这只是一个简单的例子，你可以在这里实现自己的管线
    // 在这个例子中，我们已经在场景中关闭了阴影贴图
    private buildForward (
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera,
        id: number, // window id
        width: number,
        height: number): void {

        const scene = camera.scene;
        const mainLight = scene.mainLight;

        // CSM
        const enableCSM = mainLight && mainLight.shadowEnabled;
        if (enableCSM) {
            this.buildCascadedShadowMapPass(ppl, id, mainLight, camera);
        }

        // prepare camera clear color
        // 准备摄像机清除颜色
        this._clearColor.x = camera.clearColor.x;
        this._clearColor.y = camera.clearColor.y;
        this._clearColor.z = camera.clearColor.z;
        this._clearColor.w = camera.clearColor.w;

        // prepare camera viewport
        // 准备摄像机视口
        this._viewport.left = camera.viewport.x * width;
        this._viewport.top = camera.viewport.y * height;
        this._viewport.width = camera.viewport.z * width;
        this._viewport.height = camera.viewport.w * height;

        // Forward Lighting
        // 前向光照
        {
            const pass = ppl.addRenderPass(width, height, 'default');
            // set viewport
            // 设置视口
            pass.setViewport(this._viewport);
            // bind output render target
            // 绑定输出渲染目标
            if (camera.clearFlag & gfx.ClearFlagBit.COLOR) {
                pass.addRenderTarget(`Color${id}`, gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, this._clearColor);
            } else {
                pass.addRenderTarget(`Color${id}`, gfx.LoadOp.LOAD);
            }
            // bind depth stencil buffer
            // 绑定深度模板缓冲区
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
            // CSM
            if (enableCSM) {
                pass.addTexture(`ShadowMap${id}`, 'cc_shadowMap');
            }
            // add opaque and mask queue
            // 添加不透明和遮罩队列
            pass.addQueue(rendering.QueueHint.NONE)
                .addSceneOfCamera(
                    camera,
                    new rendering.LightInfo(),
                    rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK);
            // add transparent queue
            // 添加透明队列
            pass.addQueue(rendering.QueueHint.BLEND)
                .addSceneOfCamera(
                    camera,
                    new rendering.LightInfo(),
                    rendering.SceneFlags.BLEND);
        }
    }
    // internal cached resources
    // 管线内部缓存资源
    readonly _clearColor = new gfx.Color(0, 0, 0, 1);
    readonly _viewport = new gfx.Viewport();
    readonly _flipY = cclegacy.director.root.device.capabilities.screenSpaceSignY;
}

// register pipeline
// 注册管线
rendering.setCustomPipeline('MyPipeline', new CsmPipeline());

@ccclass('pipeline_002_csm')
export class pipeline_002_csm extends Component {
    start() {
        // noop
        // 空操作
    }
    update(deltaTime: number) {
        // noop
        // 空操作
    }
}
