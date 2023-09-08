import { cclegacy, gfx, renderer, rendering } from "cc";

export function getMainLightViewport (
    light: renderer.scene.DirectionalLight,
    w: number, h: number, level: number,
    vp: gfx.Viewport): void {
    if (light.shadowFixedArea || light.csmLevel === renderer.scene.CSMLevel.LEVEL_1) {
        vp.left = 0;
        vp.top = 0;
        vp.width = Math.trunc(w);
        vp.height = Math.trunc(h);
    } else {
        vp.left = Math.trunc(level % 2 * 0.5 * w);
        if (cclegacy.director.root.device.capabilities.screenSpaceSignY > 0) {
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

const _viewport = new gfx.Viewport();

export function buildCascadedShadowMapPass(ppl: rendering.BasicPipeline,
    id: number,
    light: renderer.scene.DirectionalLight,
    camera: renderer.scene.Camera,
    newAPI = false) {
    const width = ppl.pipelineSceneData.shadows.size.x;
    const height = ppl.pipelineSceneData.shadows.size.y;
    const pass = ppl.addRenderPass(width, height, 'default');
    pass.name = 'CSM';
    pass.addRenderTarget(`ShadowMap${id}`, gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, new gfx.Color(1, 1, 1, 1));
    pass.addDepthStencil(`ShadowDepth${id}`, gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD);
    const csmLevel = ppl.pipelineSceneData.csmSupported ? light.csmLevel : 1;
    for (let level = 0; level !== csmLevel; ++level) {
        getMainLightViewport(light, width, height, level, _viewport);
        const queue = pass.addQueue(rendering.QueueHint.NONE, 'shadow-caster');
        queue.setViewport(_viewport);
        if (newAPI) {
            queue.addSceneCulledByDirectionalLight(
                camera,
                rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK | rendering.SceneFlags.SHADOW_CASTER,
                light, level)
                .setBuiltinDirectionalLightViewConstants(camera, light, level);
        } else {
            queue.addSceneOfCamera(
                camera,
                new rendering.LightInfo(light, level, true),
                rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK | rendering.SceneFlags.SHADOW_CASTER);
        }
    }
}
