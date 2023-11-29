import {
    geometry,
    gfx,
    renderer,
    rendering,
} from 'cc';

export class Lighting {
    public cullLights(scene: renderer.RenderScene, frustum: geometry.Frustum) {
        this.lights.length = 0;
        this.shadowEnabledSpotLights.length = 0;
        // spot lights
        for (let i = 0; i < scene.spotLights.length; i++) {
            const light = scene.spotLights[i];
            if (light.baked) {
                continue;
            }
            geometry.Sphere.set(this._sphere, light.position.x, light.position.y, light.position.z, light.range);
            if (geometry.intersect.sphereFrustum(this._sphere, frustum)) {
                if (light.shadowEnabled) {
                    this.shadowEnabledSpotLights.push(light);
                } else {
                    this.lights.push(light);
                }
            }
        }
        // sphere lights
        for (let i = 0; i < scene.sphereLights.length; i++) {
            const light = scene.sphereLights[i];
            if (light.baked) {
                continue;
            }
            geometry.Sphere.set(this._sphere, light.position.x, light.position.y, light.position.z, light.range);
            if (geometry.intersect.sphereFrustum(this._sphere, frustum)) {
                this.lights.push(light);
            }
        }
        // point lights
        for (let i = 0; i < scene.pointLights.length; i++) {
            const light = scene.pointLights[i];
            if (light.baked) {
                continue;
            }
            geometry.Sphere.set(this._sphere, light.position.x, light.position.y, light.position.z, light.range);
            if (geometry.intersect.sphereFrustum(this._sphere, frustum)) {
                this.lights.push(light);
            }
        }
        // ranged dir lights
        for (let i = 0; i < scene.rangedDirLights.length; i++) {
            const light = scene.rangedDirLights[i];
            geometry.AABB.transform(this._boundingBox, this._rangedDirLightBoundingBox, light.node!.getWorldMatrix());
            if (geometry.intersect.aabbFrustum(this._boundingBox, frustum)) {
                this.lights.push(light);
            }
        }
    }
    public addLightPasses(
        id: number, // window id
        width: number,
        height: number,
        camera: renderer.scene.Camera,
        ppl: rendering.BasicPipeline,
        pass: rendering.BasicRenderPassBuilder): rendering.BasicRenderPassBuilder {
        for (const light of this.lights) {
            const queue = pass.addQueue(rendering.QueueHint.BLEND, 'forward-add');
            switch (light.type) {
                case renderer.scene.LightType.SPHERE:
                    queue.name = 'sphere-light';
                    break;
                case renderer.scene.LightType.SPOT:
                    queue.name = 'spot-light';
                    break;
                case renderer.scene.LightType.POINT:
                    queue.name = 'point-light';
                    break;
                case renderer.scene.LightType.RANGED_DIRECTIONAL:
                    queue.name = 'ranged-directional-light';
                    break;
            }
            queue.addScene(
                camera,
                rendering.SceneFlags.BLEND,
                light);
        }

        for (const light of this.shadowEnabledSpotLights) {
            const shadowMapSize = ppl.pipelineSceneData.shadows.size;
            const shadowPass = ppl.addRenderPass(shadowMapSize.x, shadowMapSize.y, 'default');
            shadowPass.name = 'SpotlightShadowPass';
            shadowPass.addRenderTarget(`ShadowMap${id}`, gfx.LoadOp.CLEAR, gfx.StoreOp.STORE, new gfx.Color(1, 1, 1, 1));
            shadowPass.addDepthStencil(`ShadowDepth${id}`, gfx.LoadOp.CLEAR, gfx.StoreOp.DISCARD);
            shadowPass.addQueue(rendering.QueueHint.NONE, 'shadow-caster')
                .addScene(camera,
                    rendering.SceneFlags.OPAQUE |
                    rendering.SceneFlags.MASK |
                    rendering.SceneFlags.SHADOW_CASTER)
                .useLightFrustum(light);

            pass = ppl.addRenderPass(width, height, 'default');
            pass.name = 'SpotlightWithShadowMap';
            pass.addRenderTarget(`Color${id}`, gfx.LoadOp.LOAD);
            pass.addDepthStencil(`DepthStencil${id}`, gfx.LoadOp.LOAD);
            pass.addTexture(`ShadowMap${id}`, 'cc_spotShadowMap');
            const queue = pass.addQueue(rendering.QueueHint.BLEND, 'forward-add');
            queue.addScene(
                camera,
                rendering.SceneFlags.BLEND,
                light);
        }

        return pass;
    }
    // valid lights
    private readonly lights: renderer.scene.Light[] = [];
    private readonly shadowEnabledSpotLights: renderer.scene.SpotLight[] = [];
    private readonly _sphere = geometry.Sphere.create(0, 0, 0, 1);
    private readonly _boundingBox = new geometry.AABB();
    private readonly _rangedDirLightBoundingBox = new geometry.AABB(0.0, 0.0, 0.0, 0.5, 0.5, 0.5);
}
