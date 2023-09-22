import {
    _decorator,
    cclegacy,
    Component,
    geometry,
    gfx,
    Material,
    renderer,
    rendering,
    resources,
} from 'cc';
import { getWindowInfo, WindowInfo } from '../pipeline-data';
const { ccclass } = _decorator;

import CopyPair = rendering.CopyPair;


function addOrUpdateRenderTarget(name: string, format: gfx.Format, width: number, height: number, residency: rendering.ResourceResidency, pipeline: rendering.Pipeline) {
    if (!pipeline.containsResource(name)) {
        pipeline.addRenderTarget(name, format, width, height, residency);
    } else {
        pipeline.updateRenderTarget(name, width, height);
    }
}

const matArr: { name: string, path: string }[] = [
    { name: 'subpassMat0', path: 'subpassInOut/subpass0' },
    { name: 'subpassMat1', path: 'subpassInOut/subpass1' },
    { name: 'subpassMat2', path: 'subpassInOut/subpass2' },
];

const materialMap = new Map<string, Material>();
function loadResource() {
    for (let pair of matArr) {
        resources.load(pair.path, Material, (error, material) => {
            materialMap.set(pair.name, material);
        });
    }
}

// implement a custom pipeline
// 如何实现一个自定义渲染管线
class SubpassInOutPipeline implements rendering.PipelineBuilder {
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
            this.buildForward(ppl, camera, info.id, info.width, info.height);
        }
    }
    // internal methods
    // 管线内部方法
    private prepareCameraResources(
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

    // build a subpass test pipeline; usage shown below
    // 构建前一个subpass测例
    private buildForward(
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera,
        id: number, // window id
        width: number,
        height: number): void {

        const pipeline = ppl as rendering.Pipeline;
        addOrUpdateRenderTarget("cOne", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);
        addOrUpdateRenderTarget("cTwo", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);
        addOrUpdateRenderTarget("cThree", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);
        addOrUpdateRenderTarget("cFour", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);
        addOrUpdateRenderTarget("cFive", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MANAGED, pipeline);
        // addOrUpdateRenderTarget("ds", gfx.Format.DEPTH, width, height, rendering.ResourceResidency.MEMORYLESS, pipeline);

        const clearColor = new gfx.Color(0, 0, 0, 0);
        const builder = pipeline.addRenderPass(width, height, 'subpassInOut');
        const subpass0 = builder.addRenderSubpass('subpass0');
        // 'cFirst'
        subpass0.addRenderTarget("cOne", rendering.AccessType.WRITE, "_", gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD, clearColor);
        // 'cSecond'
        subpass0.addRenderTarget("cTwo", rendering.AccessType.WRITE, "_", gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD, clearColor);
        // 'cThird'
        subpass0.addRenderTarget("cThree", rendering.AccessType.WRITE, "_", gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD, clearColor);
        // 'cForth'
        subpass0.addRenderTarget("cFour", rendering.AccessType.WRITE, "_", gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD, clearColor);
        subpass0
            .addQueue(rendering.QueueHint.RENDER_OPAQUE, 'subpass0-phase0')
            .addFullscreenQuad(materialMap.get('subpassMat0'), 0);

        const subpass1 = builder.addRenderSubpass('subpass1');
        subpass1.addRenderTarget("cOne", rendering.AccessType.READ, "cInZ", gfx.LoadOp.DISCARD, gfx.StoreOp.STORE, clearColor);
        subpass1.addRenderTarget("cTwo", rendering.AccessType.READ, "cInA", gfx.LoadOp.DISCARD, gfx.StoreOp.STORE, clearColor);
        subpass1.addRenderTarget("cFive", rendering.AccessType.WRITE, "color", gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, clearColor);

        subpass1
            .addQueue(rendering.QueueHint.RENDER_OPAQUE, 'subpass1-phase0')
            .addFullscreenQuad(materialMap.get('subpassMat1'), 0);

        const subpass2 = builder.addRenderSubpass('subpass2');
        subpass2.addRenderTarget("cFour", rendering.AccessType.READ, "c1", gfx.LoadOp.LOAD, gfx.StoreOp.DISCARD, clearColor);
        subpass2.addRenderTarget("cThree", rendering.AccessType.READ, "c0", gfx.LoadOp.LOAD, gfx.StoreOp.DISCARD, clearColor);
        subpass2.addRenderTarget("cFive", rendering.AccessType.READ_WRITE, "color", gfx.LoadOp.LOAD, gfx.StoreOp.STORE, clearColor);

        subpass2
            .addQueue(rendering.QueueHint.RENDER_OPAQUE, 'subpass2-phase0')
            .addFullscreenQuad(materialMap.get('subpassMat2'), 0);

        const forwardPassRTName = `Color${id}`;
        const copy = new CopyPair('cFive', forwardPassRTName, 1, 1, 0, 0, 0, 0, 0, 0);
        pipeline.addCopyPass([copy]);
    }
    // internal cached resources
    // 管线内部缓存资源
    // pipeline
    readonly _clearColor = new gfx.Color(0, 0, 0, 1);
    readonly _viewport = new gfx.Viewport();
    readonly _flipY = cclegacy.director.root.device.capabilities.screenSpaceSignY;
    // scene
    readonly _sphere = geometry.Sphere.create(0, 0, 0, 1);
    readonly _boundingBox = new geometry.AABB();
    readonly _rangedDirLightBoundingBox = new geometry.AABB(0.0, 0.0, 0.0, 0.5, 0.5, 0.5);
    // valid lights
    readonly lights: renderer.scene.Light[] = [];
    readonly spotLights: renderer.scene.SpotLight[] = [];
}

// register pipeline
// 注册管线
rendering.setCustomPipeline('SubpassInOut', new SubpassInOutPipeline());

loadResource();

@ccclass('pipeline_004_subpass_in_out')
export class pipeline_004_subpass_in_out extends Component {
    start() {
        // noop
        // 空操作
    }
    update(deltaTime: number) {
        // noop
        // 空操作
    }
}
