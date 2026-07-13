import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SkewTest')
export class SkewTest extends Component {
    private _childBlock: Node = null;
    private _parentBlock: Node = null;
    private _rootBlock: Node = null;
    start() {
        this._rootBlock = this.node.getChildByPath('root');
        this._parentBlock = this.node.getChildByPath('root/parent');
        this._childBlock = this.node.getChildByPath('root/parent/child');
        
        const btnOnRoot = this.node.getChildByName('btn-on-root');
        btnOnRoot.setWorldPosition(this._rootBlock.worldPosition);
        btnOnRoot.setScale(this._rootBlock.scale);

        const btnOnParent = this.node.getChildByName('btn-on-parent');
        btnOnParent.setWorldPosition(this._parentBlock.worldPosition);
        btnOnParent.setScale(this._parentBlock.scale);

        const btnOnChild = this.node.getChildByName('btn-on-child');
        btnOnChild.setWorldPosition(this._childBlock.worldPosition);
        btnOnChild.setScale(this._childBlock.scale);
    }
}

