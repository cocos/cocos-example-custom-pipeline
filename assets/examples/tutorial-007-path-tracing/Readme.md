# Compute Shader Path Tracing

适用于本仓库的 `v4.0.0` 分支。场景、TypeScript 脚本和 Effect 资源均保存在本目录，场景入口为 `path-tracing.scene`，自定义管线名称为 `ComputeRay`。

## 运行

1. 使用与本分支兼容、支持 WebGPU Compute Pass 和 Storage Buffer 的 Creator 与引擎版本打开项目。
2. 在项目设置的图形设置中启用新渲染管线，将管线名称设置为 `ComputeRay`；在功能裁剪中启用 WebGPU。
3. 打开本目录的 `path-tracing.scene`，使用支持 WebGPU 的桌面 Chrome 或 Edge 运行浏览器预览。
4. 构建 Web Desktop 时启用 WebGPU。可以在构建面板导入本目录的 `build-config.json`，通过 HTTP 服务运行生成的 `build/path-tracing/`。

编辑器 Scene 视图执行清屏 Pass，完整路径追踪在 WebGPU 浏览器预览及构建程序中执行。该示例的控制面板使用浏览器 DOM。

## 场景与采样

场景包含 83 个图元、165 个 BVH 节点和两个面光源。几何由球体、四边形和六个四边形组成的盒体构成，BVH 在 CPU 上构建，求交和材质散射在 Compute Shader 中执行。

- 玻璃：Schlick Fresnel、Snell 折射、全反射、Beer–Lambert 颜色吸收。
- 金属：GGX 微表面采样、Smith 几何项和 Fresnel 反射。
- 石材：程序纹理、漫反射与反射涂层。
- 光照：余弦半球与面光源方向的混合重要性采样、多次散射、Russian roulette。
- 镜头：像素随机采样、景深与快门运动模糊。

默认每帧每个像素计算 2 个样本，累计至 4096 spp；默认最多进行 12 次散射，可调整至 24 次。计算分辨率默认为窗口尺寸的 75%。相机、镜头、反射次数、运动模糊或计算尺寸变化后重新累计；曝光、降噪与调试显示保留已有采样。

## 渲染流程

| Pass | 执行阶段 | 输入与输出 |
| --- | --- | --- |
| `ray-trace` | Compute Shader | 读取场景和上一帧 History，写入本帧 HDR 均值、亮度二阶矩及表面法线和距离 |
| `ray-filter`，间距 1 | Compute Shader | 从 History 读取颜色，写入 Filter0 |
| `ray-filter`，间距 2 | Compute Shader | 从 Filter0 读取颜色，写入 Filter1 |
| `ray-filter`，间距 4 | Compute Shader | 从 Filter1 读取颜色，写入 Filter0 |
| `ray-resolve` | Compute Shader | 完成曝光、ACES 与 sRGB 转换，写入 RGBA8 Display 纹理 |
| `ray-present` | Vertex / Fragment Shader | 采样 Display 纹理，绘制全屏四边形 |

Compute Shader 使用 `8 × 8` 线程组。Dispatch 数量向上取整，Shader 根据图像尺寸检查边界。

两份持久 SSBO 交替保存 History，每个像素使用 `vec4` 保存线性 HDR 颜色均值和亮度平方的均值。首轮采样完整覆盖输出，后续根据新旧样本数量更新均值。

à trous 降噪执行三轮 `5 × 5` 采样，使用空间、法线、交点距离和亮度权重保留表面边界。亮度二阶矩用于估计噪声强度。降噪输出用于显示，History 持续累计原始路径采样。关闭降噪后，`ray-resolve` 直接读取 History。

`ComputeRayPipeline` 实现 `rendering.PipelineBuilder`，在模块导入时注册。资源通过管线 API 注册，各 Pass 通过 `AccessType.READ / WRITE` 声明访问关系，由 RenderGraph 跟踪依赖与同步。场景通过 EffectAsset 引用加载四个 Effect 资源。

## 操作

- 拖动鼠标旋转相机，滚轮调整距离。
- `W / A / S / D` 移动，`Q / E` 调整高度。
- `Space` 暂停或继续采样，`R` 重新采样。
- 控制面板提供观察位置、计算分辨率、每帧样本数量、反射次数、曝光、镜头光圈、焦点距离、降噪、运动模糊、法线与距离显示。

## 文件

- `ComputeRay.ts`：管线注册、资源描述、Pass 构建、场景组件与交互控制。
- `SceneData.ts`：场景构造、材质参数、BVH 构建和 GPU 数据布局。
- `effects/path-trace.effect`：路径追踪与样本累计。
- `effects/atrous.effect`：à trous 降噪。
- `effects/resolve.effect`：HDR 显示转换及调试显示。
- `effects/present.effect`：全屏显示及纹理坐标处理。
- `build-config.json`：本场景的 WebGPU Web Desktop 构建配置。

算法参考 [Ray Tracing in One Weekend 系列](https://raytracing.github.io/)。
