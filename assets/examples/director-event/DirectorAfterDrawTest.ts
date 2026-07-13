import { _decorator, Component, Node, director, Director } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DirectorAfterDrawTest')
export class DirectorAfterDrawTest extends Component {
    @property(Node)
    testNode2D: Node | null = null;

    @property(Node)
    testNode3D: Node | null = null;

    private _tested = false;

    start() {
        this.scheduleOnce(() => {
            director.on(Director.EVENT_AFTER_DRAW, this.doTest, this);
        }, 1);
    }

    private doTest() {
        if (!this._tested) {
            this._tested = true;
            this.testNode2D?.setPosition(150, 0, 0);
            this.testNode3D?.setPosition(10, 0, 0);
            director.off(Director.EVENT_AFTER_DRAW, this.doTest, this);
        }
    }
}

