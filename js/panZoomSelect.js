/**
 *  @author Fredrik Johansson / github.com/mumme74
 */


class PanZoomSelector
{
    constructor(controller) {
        this.STATES = {NONE:-1, ZOOM:1, PAN:2}
        this.controller = controller;
        this.control = controller.renderer.controls;
        this._state = this.STATES.NONE;


        this.container = document.createElement('div');
        this.container.classList.add('panZoom')
        this.panBtn = document.createElement('span');
        this.zoomBtn = document.createElement('span');
        this.panBtn.innerText = '🕂';
        this.zoomBtn.innerText = '🔍';
        this.panBtn.title = 'Move (Press and move)';
        this.zoomBtn.title = 'Zoom (Press and move)';
        this.container.append(this.panBtn, this.zoomBtn);
        controller.renderer.container.append(this.container);

        this.zoomBtn.addEventListener('click', ()=>{
            this.changeState(this.STATES.ZOOM)
        });
        this.panBtn.addEventListener('click', ()=>{
            this.changeState(this.STATES.PAN);
        });
        document.addEventListener('keydown', (ev)=>{
            if (ev.key == 'Escape')
                this.changeState(this.STATES.NONE);
        });
        // a disables keypress, we re-eanable it
        controller.renderer.container.addEventListener('mouseup', (evt)=>{
            if (this._state !== this.STATES.NONE)
                setTimeout(this.control.setState.bind(
                               this.control, this._state),
                          0);
        })
    }

    changeState(state) {
        // emulate keypress
        if (this._state === state)
            state = this.STATES.NONE;

        this._state = state;
        this.control.setState(state);
        switch (state) {
        case this.STATES.PAN:
            this.panBtn.classList.add('selected');
            this.zoomBtn.classList.remove('selected');
            break;
        case this.STATES.ZOOM:
            this.zoomBtn.classList.add('selected');
            this.panBtn.classList.remove('selected');
            break;
        case this.STATES.NONE:
        default:
            this.zoomBtn.classList.remove('selected');
            this.panBtn.classList.remove('selected');
        }
    }
}
