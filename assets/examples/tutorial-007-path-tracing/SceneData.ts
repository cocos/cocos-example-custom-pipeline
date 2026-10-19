export const MAX_PRIMITIVES = 128;
export const MAX_NODES = MAX_PRIMITIVES * 2 - 1;
export const MAX_MATERIALS = 16;

export type Triple = [number, number, number];
export interface Primitive {
    kind: number;
    origin: Triple;
    u: Triple;
    v: Triple;
    material: number;
}
export interface BvhNode {
    lower: Triple;
    upper: Triple;
    escape: number;
    primitive: number;
}
export interface TraceScene {
    primitives: Primitive[];
    nodes: BvhNode[];
    geometry: Float32Array;
    hierarchy: Float32Array;
    materials: Float32Array;
    lightStart: number;
    lightCount: number;
}

export function primitiveBounds(primitive: Primitive): [Triple, Triple] {
    const lower: Triple = [Infinity, Infinity, Infinity];
    const upper: Triple = [-Infinity, -Infinity, -Infinity];
    for (let axis = 0; axis < 3; axis++) {
        if (primitive.kind === 0) {
            lower[axis] = Math.min(primitive.origin[axis], primitive.origin[axis] + primitive.v[axis]) - primitive.u[0];
            upper[axis] = Math.max(primitive.origin[axis], primitive.origin[axis] + primitive.v[axis]) + primitive.u[0];
        } else {
            const corners = [primitive.origin[axis], primitive.origin[axis] + primitive.u[axis],
                primitive.origin[axis] + primitive.v[axis], primitive.origin[axis] + primitive.u[axis] + primitive.v[axis]];
            lower[axis] = Math.min(...corners) - 0.0001;
            upper[axis] = Math.max(...corners) + 0.0001;
        }
    }
    return [lower, upper];
}

export function buildBvh(primitives: Primitive[]): BvhNode[] {
    const nodes: BvhNode[] = [];
    const bounds = primitives.map(primitiveBounds);
    function build(indices: number[]): void {
        const lower: Triple = [Infinity, Infinity, Infinity];
        const upper: Triple = [-Infinity, -Infinity, -Infinity];
        for (const index of indices) {
            for (let axis = 0; axis < 3; axis++) {
                lower[axis] = Math.min(lower[axis], bounds[index][0][axis]);
                upper[axis] = Math.max(upper[axis], bounds[index][1][axis]);
            }
        }
        const node: BvhNode = { lower, upper, escape: 0, primitive: indices.length === 1 ? indices[0] : -1 };
        nodes.push(node);
        if (indices.length > 1) {
            const extent = upper.map((value, axis) => value - lower[axis]);
            const axis = extent.indexOf(Math.max(...extent));
            indices.sort((a, b) => bounds[a][0][axis] + bounds[a][1][axis] - bounds[b][0][axis] - bounds[b][1][axis]);
            const middle = Math.floor(indices.length / 2);
            build(indices.slice(0, middle));
            build(indices.slice(middle));
        }
        node.escape = nodes.length;
    }
    build(primitives.map((_, index) => index));
    return nodes;
}

export function createGalleryScene(): TraceScene {
    const primitives: Primitive[] = [];
    const materials = new Float32Array(MAX_MATERIALS * 8);
    function material(index: number, color: Triple, kind: number, roughness: number, ior = 1.5): void {
        materials.set([...color, kind, roughness, ior, 0, 0], index * 8);
    }
    // 材质类型：漫反射、GGX 金属、玻璃、自发光、带反射涂层的石材。
    material(0, [0.67, 0.65, 0.59], 4, 0.16);
    material(1, [0.65, 0.62, 0.54], 0, 0);
    material(2, [0.075, 0.24, 0.22], 0, 0);
    material(3, [0.69, 0.22, 0.105], 0, 0);
    material(4, [0.95, 0.68, 0.30], 1, 0.19);
    material(5, [0.92, 0.95, 0.98], 1, 0.065);
    material(6, [0.065, 0.016, 0.006], 2, 0, 1.5);
    material(7, [0.24, 0.47, 0.58], 0, 0);
    material(8, [0.68, 0.16, 0.075], 0, 0);
    material(9, [17.0, 13.8, 9.8], 3, 0);
    material(10, [5.0, 8.0, 12.0], 3, 0);
    material(11, [0.045, 0.052, 0.061], 1, 0.32);
    material(12, [0.17, 0.31, 0.12], 0, 0);
    material(13, [0.30, 0.047, 0.015], 2, 0, 1.46);

    function sphere(origin: Triple, radius: number, materialId: number, motion: Triple = [0, 0, 0]): void {
        primitives.push({ kind: 0, origin, u: [radius, 0, 0], v: motion, material: materialId });
    }
    function quad(origin: Triple, u: Triple, v: Triple, materialId: number): void {
        primitives.push({ kind: 1, origin, u, v, material: materialId });
    }
    function box(lower: Triple, upper: Triple, materialId: number): void {
        const x = upper[0] - lower[0], y = upper[1] - lower[1], z = upper[2] - lower[2];
        quad(lower, [0, y, 0], [x, 0, 0], materialId);
        quad([lower[0], upper[1], lower[2]], [0, 0, z], [x, 0, 0], materialId);
        quad(lower, [x, 0, 0], [0, 0, z], materialId);
        quad([lower[0], lower[1], upper[2]], [x, 0, 0], [0, y, 0], materialId);
        quad(lower, [0, 0, z], [0, y, 0], materialId);
        quad([upper[0], lower[1], lower[2]], [0, y, 0], [0, 0, z], materialId);
    }

    quad([-6, 0, -6], [0, 0, 14], [12, 0, 0], 0);
    quad([-6, 0, -6], [12, 0, 0], [0, 6, 0], 1);
    quad([-6, 0, -6], [0, 6, 0], [0, 0, 14], 2);
    quad([6, 0, -6], [0, 0, 14], [0, 6, 0], 3);
    quad([-6, 6, -6], [12, 0, 0], [0, 0, 14], 1);
    box([-5.98, 0, -5.98], [5.98, 0.15, -5.7], 11);
    box([-4.85, 0.15, -5.65], [4.85, 0.62, -4.35], 11);

    // 前景三组主体展示玻璃折射、金属反射与漫反射之间的相互照明。
    box([-2.25, 0, -0.9], [-0.65, 0.55, 0.7], 1);
    sphere([-1.45, 1.62, -0.1], 1.07, 6);
    box([0.65, 0, -2.8], [2.35, 0.85, -1.1], 11);
    sphere([1.5, 1.84, -1.95], 0.99, 4);
    sphere([0.5, 0.48, 1.3], 0.48, 5);
    sphere([2.6, 0.67, 0.5], 0.67, 8);
    sphere([-3.5, 0.72, -2.2], 0.72, 7);
    sphere([-0.2, 0.36, -2.7], 0.36, 13);

    // 后方球体阵列与建筑立柱提供复杂遮挡及多次反射内容。
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 11; column++) {
            const radius = 0.22 + 0.045 * Math.sin(column * 2.1 + row);
            sphere([-4.15 + column * 0.83, 1.15 + row * 0.81, -5.16], radius,
                [4, 5, 7, 8, 12][(column + row * 2) % 5]);
        }
    }
    for (const x of [-5.3, 5.3]) {
        box([x - 0.16, 0, -4.1], [x + 0.16, 5.8, -3.78], 1);
    }
    sphere([3.55, 0.35, -2.9], 0.35, 5, [0.32, 0, 0]);

    const lightStart = primitives.length;
    quad([-2.2, 5.85, -2.8], [4.4, 0, 0], [0, 0, 3.2], 9);
    quad([-5.94, 1.6, -3.4], [0, 2.8, 0], [0, 0, 3.2], 10);
    if (primitives.length > MAX_PRIMITIVES) throw new Error('场景图元超过 Compute Shader 容量');

    const nodes = buildBvh(primitives);
    const geometry = new Float32Array(MAX_PRIMITIVES * 16);
    const hierarchy = new Float32Array(MAX_NODES * 8);
    primitives.forEach((primitive, index) => geometry.set([
        ...primitive.origin, primitive.kind,
        ...primitive.u, primitive.material,
        ...primitive.v, 0,
        0, 0, 0, 0,
    ], index * 16));
    nodes.forEach((node, index) => hierarchy.set([
        ...node.lower, node.escape, ...node.upper, node.primitive + 1,
    ], index * 8));
    return { primitives, nodes, geometry, hierarchy, materials, lightStart, lightCount: 2 };
}
