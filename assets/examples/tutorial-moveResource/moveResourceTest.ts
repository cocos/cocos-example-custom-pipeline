import {
    _decorator,
    Component,
    gfx,
    renderer,
    rendering,
    Vec3,
    Material,
    resources,
    director,
    game,
    Game
} from 'cc';
import { JSB } from 'cc/env';
import { getWindowInfo, WindowInfo } from '../pipeline-data';
const { ccclass } = _decorator;

import ResourceResidency = rendering.ResourceResidency;
import ResourceFlags = rendering.ResourceFlags;
import ResourceDimension = rendering.ResourceDimension;
import MovePair = rendering.MovePair;

const matArr: { name: string, path: string }[] = [
    { name: 'sampleTexture', path: 'mat/sampleTexture' },
];

const materialMap = new Map<string, Material>();
function loadResource () {
    for (let pair of matArr) {
        resources.load(pair.path, Material, (error, material) => {
            materialMap.set(pair.name, material);
        });
    }
}

// implement a custom pipeline
// 如何实现一个自定义渲染管线
class MoveResourcePipeline implements rendering.PipelineBuilder {
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


    private initCameraResources (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        // all resource can be initialized here
        // 所有资源可以在这里初始化
        ppl.addRenderWindow(`Color${id}`, gfx.Format.BGRA8, width, height, camera.window);
        ppl.addDepthStencil(`DepthStencil${id}`, gfx.Format.DEPTH_STENCIL, width, height);

        if (!ppl.containsResource('ctop')) {
            ppl.addRenderTarget('ctop', gfx.Format.RGBA8, width, height, ResourceResidency.MANAGED);
            ppl.addRenderTarget('cbottom', gfx.Format.RGBA8, width, height, ResourceResidency.MANAGED);
            ppl.addRenderTarget('cleft', gfx.Format.RGBA8, width, height, ResourceResidency.MANAGED);
            ppl.addRenderTarget('cright', gfx.Format.RGBA8, width, height, ResourceResidency.MANAGED);
            ppl.addRenderTarget('cfront', gfx.Format.RGBA8, width, height, ResourceResidency.MANAGED);
            ppl.addRenderTarget('crear', gfx.Format.RGBA8, width, height, ResourceResidency.MANAGED);

            ppl.addResource('texArray6', ResourceDimension.TEXTURE2D, gfx.Format.RGBA8, width, height,
                1, 6, 1, 1,
                ResourceFlags.COLOR_ATTACHMENT | ResourceFlags.SAMPLED | ResourceFlags.INPUT_ATTACHMENT,
                ResourceResidency.MANAGED);
            ppl.addResource('texArray3_0', ResourceDimension.TEXTURE2D, gfx.Format.RGBA8, width, height,
                1, 3, 1, 1,
                ResourceFlags.COLOR_ATTACHMENT | ResourceFlags.SAMPLED | ResourceFlags.INPUT_ATTACHMENT,
                ResourceResidency.MANAGED);

            ppl.addResource('texArray3_1', ResourceDimension.TEXTURE2D, gfx.Format.RGBA8, width, height,
                1, 3, 1, 1,
                ResourceFlags.COLOR_ATTACHMENT | ResourceFlags.SAMPLED | ResourceFlags.INPUT_ATTACHMENT,
                ResourceResidency.MANAGED);
        }
    }
    private updateCameraResources (ppl: rendering.BasicPipeline, camera: renderer.scene.Camera, id: number, width: number, height: number): void {
        // all resource can be updated here
        // 所有资源可以在这里更新
        ppl.updateRenderWindow(`Color${id}`, camera.window);
        ppl.updateDepthStencil(`DepthStencil${id}`, width, height);
    }

    private addForwardPass (ppl: rendering.BasicPipeline, cam: renderer.scene.Camera, width: number, height: number, targetName: string, dsName: string, clearColor: gfx.Color) {
        const pass = ppl.addRenderPass(width, height, 'default');
        pass.setViewport(this._viewport);
        pass.addRenderTarget(targetName, gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, clearColor);
        pass.addDepthStencil(
            dsName,
            gfx.LoadOp.CLEAR,
            gfx.StoreOp.DISCARD,
            1.0, 0,
            gfx.ClearFlagBit.DEPTH_STENCIL);

        pass.addQueue(rendering.QueueHint.NONE)
            .addSceneOfCamera(
                cam,
                new rendering.LightInfo(),
                rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK);
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

        const targets: string[] = ['cright', 'cleft', 'ctop', 'cbottom', 'cfront', 'crear'];
        const clearColors: gfx.Color[] = [
            new gfx.Color(1.0, 0.0, 0.0, 1.0),
            new gfx.Color(0.0, 1.0, 0.0, 1.0),
            new gfx.Color(0.0, 0.0, 1.0, 1.0),
            new gfx.Color(1.0, 1.0, 0.0, 1.0),
            new gfx.Color(1.0, 0.0, 1.0, 1.0),
            new gfx.Color(0.0, 1.0, 1.0, 1.0),
        ];

        // 1. 6 passes rendering to 6 resource separately
        // 1. 分别在6个pass渲染到6个不同的render target
        for (let i = 0; i < 6; ++i) {
            this.addForwardPass(ppl, camera, width, height, targets[i], `DepthStencil${id}`, clearColors[i]);
        }
        // camera.node.setRotationFromEuler(euler);

        if (JSB) {
            // 2. move resources which are not overlapped and have same resource description
            // 2. 对同样性质且不重叠的资源进行move
            const advancedPipeline = ppl as rendering.Pipeline;
            { // optional move test, move to a 3-slices texture first, a 3-slices texture view will be created in resource graph. 
                // 2.1 move ctop/cbottom/cleft 3 textures to a single 3-slice texArray3_0. 
                // 2.1 把 ctop/cbottom/cleft 3个texture move到一个具有3个slice的纹理数组texArray3_0上
                let mvs0 = [];
                mvs0.push(new MovePair('ctop', 'texArray3_0', 1, 1, 0, 0, 0));
                mvs0.push(new MovePair('cbottom', 'texArray3_0', 1, 1, 0, 1, 0));
                mvs0.push(new MovePair('cleft', 'texArray3_0', 1, 1, 0, 2, 0));
                advancedPipeline.addMovePass(mvs0);
            }
            {// optional move test, move rest faces to a 3-slices texture, a 3-slices texture view will be created in resource graph.
                // 2.2 move cright/cfront/crear 3 textures to a single 3-slice texture texArray3_1. 
                // 2.2 把 cright/cfront/crear 3个texture move到一个具有3个slice的纹理数组texArray3_1上
                let mvs1 = [];
                mvs1.push(new MovePair('cright', 'texArray3_1', 1, 1, 0, 0, 0));
                mvs1.push(new MovePair('cfront', 'texArray3_1', 1, 1, 0, 1, 0));
                mvs1.push(new MovePair('crear', 'texArray3_1', 1, 1, 0, 2, 0));
                advancedPipeline.addMovePass(mvs1);
            }
            {
                // 2.3 move texArray3_0 and texArray3_1 to a single 6-layer texArray6 respectively. 
                // 2.3 把 texArray3_0 和 texArray3_1 move到一个具有6个slice的纹理数组texArray6上
                const move0 = new MovePair('texArray3_0', 'texArray6', 1, 3, 0, 0, 0);
                const move1 = new MovePair('texArray3_1', 'texArray6', 1, 3, 0, 3, 0);
                advancedPipeline.addMovePass([move0, move1]);
            }
        }

        const subW = width / 3;
        const subH = height / 2;
        const vp: gfx.Viewport[] = [
            new gfx.Viewport(0, 0, subW, subH),
            new gfx.Viewport(subW, 0, subW, subH),
            new gfx.Viewport(subW * 2, 0, subW, subH),
            new gfx.Viewport(0, subH, subW, subH),
            new gfx.Viewport(subW, subH, subW, subH),
            new gfx.Viewport(subW * 2, subH, subW, subH),
        ];
        // 3. rendeirng to final screen on 6 different area and sample from different slices of texArray6
        // 3. 从texArray6不同slice上采样并渲染至屏幕上
        for (let i = 0; i < 6; ++i) {
            const loadOp = i === 0 ? gfx.LoadOp.CLEAR : gfx.LoadOp.LOAD;

            const samplePass = ppl.addRenderPass(width, height, 'sampleTexture');
            samplePass.addRenderTarget(`Color${id}`, loadOp, gfx.StoreOp.STORE, new gfx.Color());

            const samplerInfo = new gfx.SamplerInfo(gfx.Filter.POINT, gfx.Filter.POINT, gfx.Filter.POINT);
            const pointSampler = director.root.device.getSampler(samplerInfo);
            samplePass.addTexture('texArray6', 'mainTexture', pointSampler, i);
            const queue = samplePass.addQueue(rendering.QueueHint.NONE, 'sampleTexture-phase');
            queue.setViewport(vp[i]);
            queue.addFullscreenQuad(materialMap.get('sampleTexture'),
                0,
                rendering.SceneFlags.OPAQUE);

        }
    }
    // internal cached resources
    // 管线内部缓存资源
    readonly _clearColor = new gfx.Color(0, 0, 0, 1);
    readonly _viewport = new gfx.Viewport();
}

// register pipeline
// 注册管线
rendering.setCustomPipeline('MyPipeline', new MoveResourcePipeline());

@ccclass('pipeline_001')
export class pipeline_001 extends Component {
    start () {
        // noop
        // 空操作
    }
    update (deltaTime: number) {
        // noop
        // 空操作
    }
}

game.on(Game.EVENT_RENDERER_INITED, () => {
    loadResource();
});
