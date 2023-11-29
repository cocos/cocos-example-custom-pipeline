import {
    _decorator,
    cclegacy,
    Component,
    gfx,
    renderer,
    rendering,
} from 'cc';
import { getWindowInfo, needClearColor, WindowInfo } from '../pipeline-data';
import { buildCascadedShadowMapPass } from '../shadow-csm';
import { Lighting } from '../lighting';
const { ccclass } = _decorator;

// implement a custom pipeline
// 如何实现一个自定义渲染管线
class MultiLightPipeline implements rendering.PipelineBuilder {
    // implemenation of rendering.PipelineBuilder interface
    // 实现 rendering.PipelineBuilder 接口
    public setup(cameras: renderer.scene.Camera[], ppl: rendering.BasicPipeline): void {
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
            if (camera.cameraUsage >= renderer.scene.CameraUsage.GAME ||
                camera.cameraUsage === renderer.scene.CameraUsage.SCENE_VIEW) {
                this.buildForward(ppl, camera, info.id, info.width, info.height);
            } else {
                this.buildEditor(ppl, camera, info.id, info.width, info.height);
            }
        }
    }
    // internal methods
    // 管线内部方法
    private prepareCameraResources(
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera): WindowInfo {
        const width = Math.floor(camera.window.width);
        const height = Math.floor(camera.window.height);
        // get window info
        // 获取窗口信息
        const info = getWindowInfo(camera);
        // check if camera resources are initialized
        // 检查摄像机资源是否已经初始化
        if (info.width === 0 && info.height === 0) {
            info.width = width;
            info.height = height;
            this.initCameraResources(ppl, camera, info.id, info.width, info.height);
        } else if (
            // we need to check framebuffer because window may be reused
            // 我们需要检查 framebuffer，因为窗口可能被重用
            info.framebuffer !== camera.window.framebuffer ||
            // we need to check width and height because window may be resized
            // 我们需要检查宽度和高度，因为窗口可能被调整大小
            info.width !== width ||
            info.height !== height) {
            // resized or invalidated
            // 调整大小或者失效
            info.framebuffer = camera.window.framebuffer; // update framebuffer
            info.width = width; // update width
            info.height = height; // update height
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

    private initCameraResources(ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        // all resource can be initialized here
        // 所有资源可以在这里初始化
        ppl.addRenderWindow(`Color${id}`, gfx.Format.BGRA8, width, height, camera.window);
        ppl.addDepthStencil(`DepthStencil${id}`, gfx.Format.DEPTH_STENCIL, width, height);
        // CSM
        const shadowFormat = this.supportsR32FloatTexture(ppl.device) ? gfx.Format.R32F : gfx.Format.RGBA8;
        const shadowSize = ppl.pipelineSceneData.shadows.size;
        ppl.addRenderTarget(`ShadowMap${id}`, shadowFormat, shadowSize.x, shadowSize.y);
        ppl.addDepthStencil(`ShadowDepth${id}`, gfx.Format.DEPTH_STENCIL, shadowSize.x, shadowSize.y);
    }
    private updateCameraResources(ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        // all resource can be updated here
        // 所有资源可以在这里更新
        ppl.updateRenderWindow(`Color${id}`, camera.window);
        ppl.updateDepthStencil(`DepthStencil${id}`, width, height);
        // CSM
        const shadowSize = ppl.pipelineSceneData.shadows.size;
        ppl.updateRenderTarget(`ShadowMap${id}`, shadowSize.x, shadowSize.y);
        ppl.updateDepthStencil(`ShadowDepth${id}`, shadowSize.x, shadowSize.y);
    }
    private buildEditor(ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera,
        id: number, // window id
        width: number,
        height: number): void {
        const scene = camera.scene;
        const mainLight = scene.mainLight;
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
        const pass = ppl.addRenderPass(width, height, 'default');
        // set viewport
        // 设置视口
        pass.setViewport(this._viewport);
        // bind output render target
        // 绑定输出渲染目标
        if (needClearColor(camera)) {
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
        // add opaque and mask queue
        // 添加不透明和遮罩队列
        pass.addQueue(rendering.QueueHint.NONE)
            .addScene(
                camera,
                rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK,
                mainLight);
        // add transparent queue
        // 添加透明队列
        pass.addQueue(rendering.QueueHint.BLEND)
            .addScene(
                camera,
                rendering.SceneFlags.BLEND,
                mainLight);
    }
    // build forward lighting pipeline
    // NOTE: this is just a simple example, you can implement your own pipeline here
    // In this example, we have turned off shadowmap in the scene
    // 构建前向光照管线
    // 注意：这只是一个简单的例子，你可以在这里实现自己的管线
    // 在这个例子中，我们已经在场景中关闭了阴影贴图
    private buildForward(
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera,
        id: number, // window id
        width: number,
        height: number): void {
        const scene = camera.scene;
        const mainLight = scene.mainLight;

        // cull lights
        this.lighting.cullLights(scene, camera.frustum);

        // CSM
        const enableCSM = mainLight && mainLight.shadowEnabled;
        if (enableCSM) {
            buildCascadedShadowMapPass(ppl, id, mainLight, camera, this._newAPI);
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
            pass.name = 'ForwardPass';
            // set viewport
            // 设置视口
            pass.setViewport(this._viewport);
            // bind output render target
            // 绑定输出渲染目标
            if (needClearColor(camera)) {
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
                .addScene(
                    camera,
                    rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK,
                    mainLight);

            // add multi-lights
            // 添加多光源
            const pass2 = this.lighting.addLightPasses(id, width, height, camera, ppl, pass);

            // add transparent queue
            // 添加透明队列
            pass2.addQueue(rendering.QueueHint.BLEND)
                .addScene(
                    camera,
                    rendering.SceneFlags.BLEND | rendering.SceneFlags.UI,
                    mainLight);
        }
    }
    // internal cached resources
    // 管线内部缓存资源
    // pipeline
    readonly _newAPI = true;
    readonly _clearColor = new gfx.Color(0, 0, 0, 1);
    readonly _viewport = new gfx.Viewport();
    readonly _flipY = cclegacy.director.root.device.capabilities.screenSpaceSignY;
    // scene
    private readonly lighting = new Lighting();
}

// register pipeline
// 注册管线
rendering.setCustomPipeline('Pipeline003', new MultiLightPipeline());

@ccclass('pipeline_003_multi_light')
export class pipeline_003_multi_light extends Component {
    start() {
        // noop
        // 空操作
    }
    update(deltaTime: number) {
        // noop
        // 空操作
    }
}
