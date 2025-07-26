/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 */

var CWS = {};

CWS.Events = function () {
    this._eventListeners = [];
    this.addEventListener = (event, callback) => {
        this._eventListeners.push({event, callback});
    };

    this.removeEventListener = (event, callback)=>{
        const idx = this._eventListensers.findIndex(
            e=>e.callback===callback && e.event === event);
        if (idx !== -1)
            this._eventListeners.splice(idx, 1);
    }

    this._emitEvent = (event, data) => {
        for (const e of this._eventListeners)
            if (e.event === event)
                e.callback(data);
    }
}
