import { cclegacy, renderer, gfx } from "cc";

export class WindowInfo {
    constructor (id: number, width: number, height: number, framebuffer: gfx.Framebuffer) {
        this.id = id;
        this.width = width;
        this.height = height;
        this.framebuffer = framebuffer;
    }
    id = 0xFFFFFFFF;
    width = 0;
    height = 0;
    framebuffer: gfx.Framebuffer;
}

if (cclegacy.rendering.windowID === undefined) {
    cclegacy.rendering.windowID = 0;
    cclegacy.rendering.windows = new WeakMap<Object, WindowInfo>();
}

const windows = cclegacy.rendering.windows;

export function getWindowInfo(camera: renderer.scene.Camera): WindowInfo {
    let info = windows.get(camera.window);
    if (info !== undefined) {
        return info;
    }
    info = new WindowInfo(cclegacy.rendering.windowID, 0, 0, camera.window.framebuffer);
    ++cclegacy.rendering.windowID;
    windows.set(camera.window, info);
    return info;
}
