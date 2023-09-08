import { gfx, renderer, rendering } from "cc";

export function buildCascadedShadowMapPass(ppl: rendering.BasicPipeline,
    id: number,
    light: renderer.scene.DirectionalLight,
    camera: renderer.scene.Camera) {
    const width = ppl.pipelineSceneData.shadows.size.x;
    const height = ppl.pipelineSceneData.shadows.size.y;
    const pass = ppl.addRenderPass(width, height, 'default');
    pass.name = 'CSM';
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
        queue.addSceneOfCamera(camera, new rendering.LightInfo(light, level, true),
            rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK | rendering.SceneFlags.SHADOW_CASTER);
    }
}
