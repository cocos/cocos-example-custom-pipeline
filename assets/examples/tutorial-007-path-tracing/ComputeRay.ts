import {
    _decorator, Camera, Component, EffectAsset, gfx, Material,
    renderer, rendering, Vec3, Vec4,
} from 'cc';
import { EDITOR } from 'cc/env';
import { createGalleryScene, TraceScene } from './SceneData';

const { ccclass, property, requireComponent } = _decorator;
const PIPELINE_NAME = 'ComputeRay';
const MAX_SAMPLES = 4096;

interface WindowState {
    id: number;
    width: number;
    height: number;
    framebuffer: gfx.Framebuffer;
    revision: number;
    samples: number;
    output: number;
}

class ComputeRayPipeline implements rendering.PipelineBuilder {
    private readonly demos = new Map<renderer.scene.Camera, ComputeRayDemo>();
    private readonly windows = new Map<object, WindowState>();
    private readonly editorWindows = new Map<object, number>();

    public initialize(demo: ComputeRayDemo): void {
        this.demos.set(demo.getComponent(Camera)!.camera, demo);
        const device = gfx.deviceManager.gfxDevice;
        if (device.gfxAPI !== gfx.API.WEBGPU) throw new Error('ComputeRay 需要 WebGPU');
        const data = [demo.sceneData.geometry, demo.sceneData.hierarchy, demo.sceneData.materials];
        const names = ['u_geometry', 'u_hierarchy', 'u_materials'];
        data.forEach((values, index) => {
            const vectors: Vec4[] = [];
            for (let offset = 0; offset < values.length; offset += 4) {
                vectors.push(new Vec4(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]));
            }
            demo.traceMaterial.setProperty(names[index], vectors);
        });
    }

    public release(demo: ComputeRayDemo): void {
        const camera = demo.getComponent(Camera)!.camera;
        this.demos.delete(camera);
        this.windows.delete(camera);
    }

    public setup(cameras: renderer.scene.Camera[], basicPipeline: rendering.BasicPipeline): void {
        if (EDITOR) {
            for (const camera of cameras) {
                const window = camera.window;
                if (!this.editorWindows.has(window)) this.editorWindows.set(window, this.editorWindows.size);
                const name = `ComputeRayEditor${this.editorWindows.get(window)}`;
                basicPipeline.addRenderWindow(name, gfx.Format.BGRA8, window.width, window.height, window);
                const pass = basicPipeline.addRenderPass(window.width, window.height, 'ray-present');
                pass.addRenderTarget(name, gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, new gfx.Color(0.02, 0.03, 0.04, 1));
            }
            return;
        }
        const pipeline = basicPipeline as rendering.Pipeline;
        for (const [camera, demo] of this.demos) {
            if (cameras.indexOf(camera) >= 0) this.renderCamera(camera, pipeline, demo);
        }
    }

    private renderCamera(camera: renderer.scene.Camera, pipeline: rendering.Pipeline, demo: ComputeRayDemo): void {
        const window = camera.window;
        const width = Math.max(1, Math.floor(window.width * demo.resolution));
        const height = Math.max(1, Math.floor(window.height * demo.resolution));
        let state = this.windows.get(camera);
        if (state === undefined) {
            state = { id: this.windows.size, width: 0, height: 0, framebuffer: window.framebuffer,
                revision: -1, samples: 0, output: 0 };
            this.windows.set(camera, state);
        }
        const prefix = `ComputeRay${state.id}`;
        const history = [`${prefix}History0`, `${prefix}History1`];
        const guide = `${prefix}Guide`;
        const filtered = [`${prefix}Filter0`, `${prefix}Filter1`];
        const color = `${prefix}Window`;
        pipeline.addRenderWindow(color, gfx.Format.BGRA8, window.width, window.height, window);
        if (width !== state.width || height !== state.height || window.framebuffer !== state.framebuffer) {
            for (const name of history) pipeline.addStorageBuffer(name, gfx.Format.UNKNOWN, width * height * 16, rendering.ResourceResidency.PERSISTENT);
            for (const name of filtered) pipeline.addStorageBuffer(name, gfx.Format.UNKNOWN, width * height * 16);
            pipeline.addStorageBuffer(guide, gfx.Format.UNKNOWN, width * height * 16, rendering.ResourceResidency.PERSISTENT);
            pipeline.addStorageTexture(`${prefix}Display`, gfx.Format.RGBA8, width, height);
            state.width = width;
            state.height = height;
            state.framebuffer = window.framebuffer;
            state.samples = 0;
            state.output = 0;
        }
        if (state.revision !== demo.revision) {
            state.samples = 0;
            state.output = 0;
            state.revision = demo.revision;
        }
        const groupX = Math.ceil(width / 8), groupY = Math.ceil(height / 8);
        if (state.samples === 0 || (!demo.paused && state.samples < MAX_SAMPLES)) {
            const sampleCount = Math.min(demo.samplesPerFrame, MAX_SAMPLES - state.samples);
            const destination = 1 - state.output;
            const pass = pipeline.addComputePass('ray-trace');
            pass.name = '路径追踪与采样累积';
            pass.addStorageBuffer(history[state.output], rendering.AccessType.READ, 'b_history');
            pass.addStorageBuffer(history[destination], rendering.AccessType.WRITE, 'b_radiance');
            pass.addStorageBuffer(guide, rendering.AccessType.WRITE, 'b_guide');
            demo.traceMaterial.setProperty('u_eye', new Vec4(demo.eye.x, demo.eye.y, demo.eye.z, Math.tan(20 * Math.PI / 180)));
            demo.traceMaterial.setProperty('u_right', new Vec4(demo.right.x, demo.right.y, demo.right.z, demo.aperture));
            demo.traceMaterial.setProperty('u_up', new Vec4(demo.up.x, demo.up.y, demo.up.z, demo.motionBlur ? 1 : 0));
            demo.traceMaterial.setProperty('u_forward', new Vec4(demo.forward.x, demo.forward.y, demo.forward.z, demo.focusDistance));
            demo.traceMaterial.setProperty('u_sampling', new Vec4(state.samples, sampleCount, demo.bounces, 0));
            demo.traceMaterial.setProperty('u_extent', new Vec4(width, height, 0, 0));
            demo.traceMaterial.setProperty('u_scene', new Vec4(demo.sceneData.primitives.length, demo.sceneData.nodes.length,
                demo.sceneData.lightStart, demo.sceneData.lightCount));
            pass.addQueue().addDispatch(groupX, groupY, 1, demo.traceMaterial, 0);
            state.output = destination;
            state.samples += sampleCount;
        }
        let result = history[state.output];
        if (demo.denoise) {
            for (let iteration = 0; iteration < 3; iteration++) {
                const destination = filtered[iteration % 2];
                const pass = pipeline.addComputePass('ray-filter');
                pass.name = `à trous 降噪 ${iteration + 1}`;
                pass.addStorageBuffer(result, rendering.AccessType.READ, 'b_source');
                pass.addStorageBuffer(guide, rendering.AccessType.READ, 'b_guide');
                pass.addStorageBuffer(destination, rendering.AccessType.WRITE, 'b_filtered');
                demo.filterMaterials[iteration].setProperty('u_filter', new Vec4(1 << iteration, state.samples, width, height));
                pass.addQueue().addDispatch(groupX, groupY, 1, demo.filterMaterials[iteration], 0);
                result = destination;
            }
        }
        const resolve = pipeline.addComputePass('ray-resolve');
        resolve.name = 'HDR 显示转换';
        resolve.addStorageBuffer(result, rendering.AccessType.READ, 'b_source');
        resolve.addStorageBuffer(guide, rendering.AccessType.READ, 'b_guide');
        resolve.addStorageImage(`${prefix}Display`, rendering.AccessType.WRITE, 'displayOutput');
        demo.resolveMaterial.setProperty('u_display', new Vec4(demo.exposure, demo.debugView, width, height));
        resolve.addQueue().addDispatch(groupX, groupY, 1, demo.resolveMaterial, 0);
        const pass = pipeline.addRenderPass(window.width, window.height, 'ray-present');
        pass.name = 'Compute 结果显示';
        pass.addRenderTarget(color, gfx.LoadOp.DISCARD, gfx.StoreOp.STORE);
        pass.addTexture(`${prefix}Display`, 'mainTexture');
        pass.addQueue(rendering.QueueHint.OPAQUE, 'ray-present-phase').addFullscreenQuad(demo.presentMaterial, 0);
        demo.samples = state.samples;
        demo.renderWidth = width;
        demo.renderHeight = height;
    }
}

const pipeline = new ComputeRayPipeline();
if (rendering) {
    rendering.setCustomPipeline(PIPELINE_NAME, pipeline);
}

@ccclass('ComputeRayDemo')
@requireComponent(Camera)
export class ComputeRayDemo extends Component {
    @property(EffectAsset) public traceEffect: EffectAsset = null!;
    @property(EffectAsset) public filterEffect: EffectAsset = null!;
    @property(EffectAsset) public resolveEffect: EffectAsset = null!;
    @property(EffectAsset) public presentEffect: EffectAsset = null!;

    public readonly sceneData: TraceScene = createGalleryScene();
    public traceMaterial: Material;
    public filterMaterials: Material[];
    public resolveMaterial: Material;
    public presentMaterial: Material;
    public revision = 0;
    public resolution = 0.75;
    public samplesPerFrame = 2;
    public bounces = 12;
    public aperture = 0.018;
    public focusDistance = 13;
    public motionBlur = false;
    public denoise = true;
    public exposure = 0;
    public debugView = 0;
    public paused = false;
    public samples = 0;
    public renderWidth = 0;
    public renderHeight = 0;
    public readonly eye = new Vec3();
    public readonly right = new Vec3();
    public readonly up = new Vec3();
    public readonly forward = new Vec3();
    private readonly target = new Vec3(0, 1.5, -1.7);
    private yaw = 0.29;
    private pitch = 0.15;
    private radius = 13.5;
    private panel: HTMLDivElement;
    private controller: AbortController;
    private keys = new Set<string>();
    private lastStatusUpdate = 0;
    private smoothedFrameTime = 16.7;

    protected onLoad(): void {
        this.traceMaterial = new Material();
        this.traceMaterial.initialize({ effectAsset: this.traceEffect });
        this.filterMaterials = [0, 1, 2].map(() => {
            const material = new Material();
            material.initialize({ effectAsset: this.filterEffect });
            return material;
        });
        this.resolveMaterial = new Material();
        this.resolveMaterial.initialize({ effectAsset: this.resolveEffect });
        this.presentMaterial = new Material();
        this.presentMaterial.initialize({ effectAsset: this.presentEffect });
        pipeline.initialize(this);
        this.updateCamera();
        this.createPanel();
    }

    public reset(): void {
        this.revision++;
    }

    private updateCamera(): void {
        this.eye.set(this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.radius,
            this.target.y + Math.sin(this.pitch) * this.radius,
            this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.radius);
        Vec3.subtract(this.forward, this.target, this.eye);
        this.forward.normalize();
        Vec3.cross(this.right, this.forward, Vec3.UP).normalize();
        Vec3.cross(this.up, this.right, this.forward).normalize();
        this.node.setWorldPosition(this.eye);
        this.node.lookAt(this.target);
        this.reset();
    }

    protected update(deltaTime: number): void {
        this.smoothedFrameTime += (deltaTime * 1000 - this.smoothedFrameTime) * 0.05;
        const movement = new Vec3();
        if (this.keys.has('KeyW')) Vec3.add(movement, movement, this.forward);
        if (this.keys.has('KeyS')) Vec3.subtract(movement, movement, this.forward);
        if (this.keys.has('KeyD')) Vec3.add(movement, movement, this.right);
        if (this.keys.has('KeyA')) Vec3.subtract(movement, movement, this.right);
        if (this.keys.has('KeyE')) movement.y += 1;
        if (this.keys.has('KeyQ')) movement.y -= 1;
        if (movement.lengthSqr() > 0) {
            movement.normalize().multiplyScalar(deltaTime * 3);
            this.target.add(movement);
            this.updateCamera();
        }
        this.lastStatusUpdate += deltaTime;
        if (this.lastStatusUpdate >= 0.25) {
            this.lastStatusUpdate = 0;
            this.panel.querySelector('#ray-samples')!.textContent = this.samples.toLocaleString();
            this.panel.querySelector('#ray-status')!.textContent = `${this.renderWidth} × ${this.renderHeight} · ${this.smoothedFrameTime.toFixed(1)} ms · ${this.sceneData.primitives.length} 图元 · ${this.sceneData.nodes.length} BVH 节点`;
            this.panel.querySelector('#ray-progress')!.setAttribute('style', `width:${100 * this.samples / MAX_SAMPLES}%`);
            this.panel.querySelector('#ray-state')!.textContent = this.paused ? '采样暂停' : (this.samples >= MAX_SAMPLES ? '采样完成' : '逐帧采样中');
        }
    }

    private createPanel(): void {
        this.controller = new AbortController();
        const signal = this.controller.signal;
        this.panel = document.createElement('div');
        this.panel.id = 'compute-ray';
        this.panel.innerHTML = `
          <style>
            #compute-ray{position:fixed;inset:0;pointer-events:none;color:#f0ece1;font:13px/1.5 system-ui,sans-serif;z-index:100}
            #compute-ray *{box-sizing:border-box} #compute-ray .ray-header{position:absolute;top:30px;left:34px;text-shadow:0 2px 12px #0009}
            #compute-ray .ray-kicker{letter-spacing:3px;font-size:10px;color:#d4b787} #compute-ray h1{font-size:30px;font-weight:450;letter-spacing:1px;margin:5px 0}
            #compute-ray .ray-description{color:#d4d2c9;font-size:12px} #compute-ray .ray-controls{position:absolute;right:24px;top:28px;width:244px;max-height:calc(100vh - 56px);overflow:auto;background:#141a1ddd;border:1px solid #ffffff20;border-radius:12px;padding:18px;pointer-events:auto;backdrop-filter:blur(18px)}
            #compute-ray .ray-controls summary{cursor:pointer;font-size:14px;margin-bottom:14px} #compute-ray label{display:block;color:#bcbfb9;margin:12px 0 5px;font-size:11px}
            #compute-ray select,#compute-ray button{background:#253035;color:#eee8dc;border:1px solid #ffffff24;border-radius:5px;padding:6px 9px;font:inherit}
            #compute-ray select{width:100%} #compute-ray input[type=range]{width:100%;accent-color:#d9b67a;height:14px} #compute-ray input[type=checkbox]{accent-color:#d9b67a;vertical-align:middle}
            #compute-ray .ray-row{display:flex;justify-content:space-between;gap:8px;margin-top:12px} #compute-ray button{cursor:pointer;flex:1} #compute-ray button:hover{background:#3c4a4d}
            #compute-ray .ray-footer{position:absolute;left:34px;bottom:26px;max-width:calc(100vw - 68px);background:#11191ccc;border:1px solid #ffffff1c;border-radius:8px;padding:12px 18px;pointer-events:auto}
            #compute-ray .ray-count{font-size:25px;font-variant-numeric:tabular-nums} #compute-ray small{color:#aeb8b5} #compute-ray .ray-bar{height:2px;background:#ffffff18;margin:8px 0} #ray-progress{height:2px;background:#d9b67a}
            #compute-ray .ray-help{margin-top:5px;font-size:11px;color:#b2bab5} #compute-ray .ray-value{float:right;color:#e5c58d}
            @media(max-width:800px){#compute-ray .ray-header{top:16px;left:18px}#compute-ray h1{font-size:23px}#compute-ray .ray-controls{top:100px;right:12px;width:210px;max-height:calc(100vh - 120px);padding:12px}#compute-ray .ray-footer{left:18px;bottom:14px}#compute-ray .ray-description{max-width:240px}}
          </style>
          <div class="ray-header"><div class="ray-kicker">COMPUTE / PATH TRACING</div><h1>光线陈列室</h1><div class="ray-description">玻璃、黄铜与石材之间的光线旅程</div></div>
          <details class="ray-controls" open><summary>渲染控制</summary>
            <label>观察位置</label><select id="ray-camera"><option value="gallery">陈列室全景</option><option value="glass">玻璃与金属</option><option value="material">材质阵列</option></select>
            <label>计算分辨率</label><select id="ray-resolution"><option value="0.5">50%</option><option value="0.75" selected>75%</option><option value="1">100%</option></select>
            <label>每帧采样</label><select id="ray-spp"><option value="1">1 spp</option><option value="2" selected>2 spp</option><option value="4">4 spp</option><option value="8">8 spp</option></select>
            <label>反射次数 <span class="ray-value" id="ray-bounces-value">12</span></label><input id="ray-bounces" type="range" min="2" max="24" step="1" value="12">
            <label>曝光 EV <span class="ray-value" id="ray-exposure-value">0.0</span></label><input id="ray-exposure" type="range" min="-3" max="3" step="0.1" value="0">
            <label>镜头光圈 <span class="ray-value" id="ray-aperture-value">0.018</span></label><input id="ray-aperture" type="range" min="0" max="0.15" step="0.001" value="0.018">
            <label>焦点距离 <span class="ray-value" id="ray-focus-value">13.0</span></label><input id="ray-focus" type="range" min="3" max="25" step="0.1" value="13">
            <label><input id="ray-denoise" type="checkbox" checked> à trous 降噪</label><label><input id="ray-motion" type="checkbox"> 快门运动模糊</label>
            <label>显示内容</label><select id="ray-view"><option value="0">完整光照</option><option value="1">表面法线</option><option value="2">射线距离</option></select>
            <div class="ray-row"><button id="ray-pause">暂停</button><button id="ray-reset">重新采样</button></div>
          </details>
          <div class="ray-footer"><span class="ray-count" id="ray-samples">0</span> <small>/ 4096 spp</small>　<span id="ray-state">逐帧采样中</span><div class="ray-bar"><div id="ray-progress"></div></div><small id="ray-status"></small><div class="ray-help">拖动旋转 · 滚轮缩放 · WASD 移动 · Q/E 升降 · 空格暂停 · R 重新采样</div></div>`;
        document.body.appendChild(this.panel);
        const select = (id: string) => this.panel.querySelector<HTMLInputElement>(id)!;
        select('#ray-resolution').addEventListener('change', event => { this.resolution = Number((event.target as HTMLSelectElement).value); this.reset(); }, { signal });
        select('#ray-spp').addEventListener('change', event => { this.samplesPerFrame = Number((event.target as HTMLSelectElement).value); }, { signal });
        const range = (id: string, apply: (value: number) => void, reset: boolean, digits: number): void => {
            select(id).addEventListener('input', event => {
                const value = Number((event.target as HTMLInputElement).value);
                apply(value);
                this.panel.querySelector(`${id}-value`)!.textContent = value.toFixed(digits);
                if (reset) this.reset();
            }, { signal });
        };
        range('#ray-bounces', value => { this.bounces = value; }, true, 0);
        range('#ray-exposure', value => { this.exposure = value; }, false, 1);
        range('#ray-aperture', value => { this.aperture = value; }, true, 3);
        range('#ray-focus', value => { this.focusDistance = value; }, true, 1);
        select('#ray-denoise').addEventListener('change', event => { this.denoise = (event.target as HTMLInputElement).checked; }, { signal });
        select('#ray-motion').addEventListener('change', event => { this.motionBlur = (event.target as HTMLInputElement).checked; this.reset(); }, { signal });
        select('#ray-view').addEventListener('change', event => { this.debugView = Number((event.target as HTMLSelectElement).value); }, { signal });
        select('#ray-pause').addEventListener('click', () => this.togglePause(), { signal });
        select('#ray-reset').addEventListener('click', () => this.reset(), { signal });
        select('#ray-camera').addEventListener('change', event => {
            const name = (event.target as HTMLSelectElement).value;
            if (name === 'gallery') { this.target.set(0, 1.5, -1.7); this.yaw = 0.29; this.pitch = 0.15; this.radius = 13.5; this.focusDistance = 13; }
            if (name === 'glass') { this.target.set(-0.8, 1.3, -0.2); this.yaw = 0.18; this.pitch = 0.12; this.radius = 7.3; this.focusDistance = 7.3; }
            if (name === 'material') { this.target.set(0, 2, -4.8); this.yaw = -0.13; this.pitch = 0.05; this.radius = 9.5; this.focusDistance = 9.5; }
            select('#ray-focus').value = String(this.focusDistance);
            this.panel.querySelector('#ray-focus-value')!.textContent = this.focusDistance.toFixed(1);
            this.updateCamera();
        }, { signal });
        const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
        let dragging = false;
        canvas.addEventListener('pointerdown', event => { dragging = true; canvas.setPointerCapture(event.pointerId); canvas.focus(); }, { signal });
        canvas.addEventListener('pointerup', () => { dragging = false; }, { signal });
        canvas.addEventListener('pointercancel', () => { dragging = false; }, { signal });
        canvas.addEventListener('pointermove', event => {
            if (dragging) {
                this.yaw -= event.movementX * 0.004;
                this.pitch = Math.min(0.65, Math.max(-0.08, this.pitch + event.movementY * 0.004));
                this.updateCamera();
            }
        }, { signal });
        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            this.radius = Math.min(22, Math.max(3, this.radius * Math.exp(event.deltaY * 0.001)));
            this.updateCamera();
        }, { signal, passive: false });
        window.addEventListener('keydown', event => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'KeyR'].indexOf(event.code) >= 0) event.preventDefault();
            this.keys.add(event.code);
            if (!event.repeat && event.code === 'Space') this.togglePause();
            if (!event.repeat && event.code === 'KeyR') this.reset();
        }, { signal });
        window.addEventListener('keyup', event => { this.keys.delete(event.code); }, { signal });
        window.addEventListener('blur', () => { this.keys.clear(); dragging = false; }, { signal });
    }

    private togglePause(): void {
        this.paused = !this.paused;
        this.panel.querySelector('#ray-pause')!.textContent = this.paused ? '继续' : '暂停';
    }

    protected onDestroy(): void {
        this.controller.abort();
        this.panel.remove();
        pipeline.release(this);
        this.traceMaterial.destroy();
        this.filterMaterials.forEach(material => material.destroy());
        this.resolveMaterial.destroy();
        this.presentMaterial.destroy();
    }
}
