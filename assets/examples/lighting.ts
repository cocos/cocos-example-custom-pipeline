import {
    geometry,
    renderer,
    rendering,
} from 'cc';

export class Lighting {
    public cullLights(scene: renderer.RenderScene, frustum: geometry.Frustum) {
        this.lights.length = 0;
        this.spotLights.length = 0;
        // spot lights
        for (let i = 0; i < scene.spotLights.length; i++) {
            const light = scene.spotLights[i];
            if (light.baked) {
                continue;
            }
            geometry.Sphere.set(this._sphere, light.position.x, light.position.y, light.position.z, light.range);
            if (geometry.intersect.sphereFrustum(this._sphere, frustum)) {
                this.lights.push(light);
                this.spotLights.push(light);
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
    public addLightPasses(camera: renderer.scene.Camera, pass: rendering.BasicRenderPassBuilder) {
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
    }
    // valid lights
    private readonly lights: renderer.scene.Light[] = [];
    private readonly spotLights: renderer.scene.SpotLight[] = [];
    private readonly _sphere = geometry.Sphere.create(0, 0, 0, 1);
    private readonly _boundingBox = new geometry.AABB();
    private readonly _rangedDirLightBoundingBox = new geometry.AABB(0.0, 0.0, 0.0, 0.5, 0.5, 0.5);
}
