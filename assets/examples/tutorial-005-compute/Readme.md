# Custom pipeline subpass in and out test

support backend:
- GLES
- Vulkan
- Metal
- WebGPU

This example shows how to use compute pass.
```typescript 
rendering.setCustomPipeline('RaytracingWeekend', new HelloWorldPipeline());
```
---
Pay attention to sample coordinates:
`addFullscreenQuad` generates vertices and texture coordinates,
```
[x, y,   u, v]
{
    [-1, -1,   0, 1],
    [ 1, -1,   1, 1],
    [-1,  1,   0, 0],
    [ 1,  1,   1, 0],
}
```
In rt-compute.effect,
```
uint currY = gl_GlobalInvocationID.y;
...
imageStore(co, ivec2(gl_GlobalInvocationID.xy), color);
```
Lower value of Y is stored into start address of texture. If texture coordinates (0, 0) lies on top-left corner, which opposite from the world coordinates when we look from bottom to top, we have to flip the y component of texture coordinates.
```
#if defined(CC_USE_METAL) || defined(CC_USE_WGPU)
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
#else
    vec2 uv = v_uv;
#endif
```

Vulkan: we didn't filp Y in ndc, sample texture coord (0, 0) appears at bottom-left.

GLES: sample texture coord (0, 0) appears at bottom-left.


