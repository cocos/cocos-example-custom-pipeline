import {
    _decorator,
    CameraComponent,
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
const { ccclass, property } = _decorator;

import CopyPair = rendering.CopyPair;



function addOrUpdateRenderTarget(name: string, format: gfx.Format, width: number, height: number, residency: rendering.ResourceResidency, pipeline: rendering.Pipeline) {
    if (!pipeline.containsResource(name)) {
        pipeline.addRenderTarget(name, format, width, height, residency);
    } else {
        pipeline.updateRenderTarget(name, width, height);
    }
}

function addOrUpdateStorageTexture(name: string, format: gfx.Format, width: number, height: number, residency: rendering.ResourceResidency, pipeline: rendering.Pipeline) {
    if (!pipeline.containsResource(name)) {
        pipeline.addStorageTexture(name, format, width, height, residency);
    } else {
        pipeline.updateStorageTexture(name, width, height, format);
    }
}

const matArr: { name: string, path: string }[] = [
    { name: 'rt1w', path: 'raytracing-compute/rt-compute' },
    { name: 'swizzleQuad', path: 'raytracing-compute/rt-swizzle' },
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
class RaytracingByComputePipeline implements rendering.PipelineBuilder {
    // @property(CameraComponent)
    // mainCam: CameraComponent = null!;


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

    private initCameraResources(ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        // all resource can be initialized here
        // 所有资源可以在这里初始化
        ppl.addRenderWindow(`Color${id}`, gfx.Format.BGRA8, width, height, camera.window);
        ppl.addDepthStencil(`DepthStencil${id}`, gfx.Format.DEPTH_STENCIL, width, height);
    }
    private updateCameraResources(ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        // all resource can be updated here
        // 所有资源可以在这里更新
        ppl.updateRenderWindow(`Color${id}`, camera.window);
        ppl.updateDepthStencil(`DepthStencil${id}`, width, height);
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
        addOrUpdateStorageTexture("storage", gfx.Format.RGBA8, width, height, rendering.ResourceResidency.MANAGED, pipeline);

        const computePass = pipeline.addComputePass("rt1w");
        computePass.addStorageImage("storage", rendering.AccessType.WRITE, "co");
        computePass.addQueue().addDispatch(width / 8, height / 4, 1, materialMap.get("rt1w"));

        const renderTarget = `Color${id}`;
        if (1) {
            const pass = pipeline.addRenderPass(width, height, "swizzle");
            pass.addRenderTarget(renderTarget, gfx.LoadOp.DISCARD, gfx.StoreOp.STORE)
            pass.addTexture("storage", "mainTexture");
            pass.addQueue(rendering.QueueHint.OPAQUE, "swizzle-phase")
                .addFullscreenQuad(materialMap.get("swizzleQuad"), 0);
        } else {
            pipeline.addCopyPass([new CopyPair("storage", renderTarget, 1, 1, 0, 0, 0, 0, 0, 0)]);
        }
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
rendering.setCustomPipeline('RaytracingWeekend', new RaytracingByComputePipeline());

loadResource();

@ccclass('pipeline_005_raytracing_in_1_weekend')
export class pipeline_005_raytracing_in_1_weekend extends Component {
    start() {
        // noop
        // 空操作
    }
    update(deltaTime: number) {
        // noop
        // 空操作
    }
}
