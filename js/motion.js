/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 * @author Fredrik Johansson / github.com/mumme74
 */

// states that motion can have, including debug
CWS.MotionStates = {
    Idle:"idle", Running:"running", Continue: "continue",
    Next:"next", StepOut:"stepout", Halted: "halted",
    Stop:"stop"
};

CWS.Motion = function ()
    {
        this.worker      = new Worker("./js/motionWorker.js");
        this.state       = CWS.MotionStates.Idle;
        this.data        = null;
        this.controller  = null;
        this.breakPnts   = [];
        this.state       = CWS.MotionStates.Idle;
        this.inflight    = false;
        this.atLine      = -1;

        // Possible events are:
        //   run
        //   idle
        //   startDebug
        //   endDebug
        //   halted
        CWS.Events.call(this);
    };


//   startDebug
//   endDebug

CWS.Motion.prototype.constructor = CWS.Motion;

CWS.Motion.prototype.register

CWS.Motion.prototype.run = function ()
    {
        if (this.state === CWS.MotionStates.Idle)
        {
            this.postMessage(CWS.MotionStates.Running);
            this._emitEvent('run');
        }
    };

CWS.Motion.prototype.contin = function ()
    {
        if (this.state === CWS.MotionStates.Idle ||
            this.state === CWS.MotionStates.Halted)
        {
            this.postMessage(CWS.MotionStates.Continue);
            this._emitEvent('startDebug')
        }
    }

CWS.Motion.prototype.next = function ()
    {
        if (this.state === CWS.MotionStates.Halted)
            this.postMessage(CWS.MotionStates.Next);
    }

CWS.Motion.prototype.stepOut = function ()
    {
        if (this.state === CWS.MotionStates.Halted)
            this.postMessage(CWS.MotionStates.StepOut);
    }

CWS.Motion.prototype.stop = function()
    {
        if (this.state === CWS.MotionStates.Halted) {
            this.worker.postMessage({state:CWS.MotionStates.Stop});
        } else if (this.state !== CWS.MotionStates.Idle) {
            this.worker.terminate();
            this.worker = new Worker("./js/motionWorker.js");
        }
        this.state = CWS.MotionStates.Idle;
        this.inflight = false;
        this.data = null;

        this._emitEvent('idle');
    }

CWS.Motion.prototype.setData = function (data)
    {
        this.data=data;
        if (Array.isArray(data.breakPnts))
            this.setBreakpoints(data.breakPnts);
    };

CWS.Motion.prototype.setBreakpoints = function(breakPnts)
    {
        this.breakPnts = breakPnts;
    }

CWS.Motion.prototype.getVariableVlu = function(varName, cb)
    {
        if (this.state === CWS.MotionStates.Halted && !this.varVluCb) {
            this.varVluCb = cb;
            this.postMessage(this.state, varName);
        }
    }

CWS.Motion.prototype.postMessage = function (state, extra)
    {
        if (!this.inflight && this.data)
            {
                this.inflight = true;
                this.state = state;
                this.worker.postMessage({
                    ...this.data, state, extra, breakPnts: this.breakPnts});
            }
    };

CWS.Motion.prototype.setController = function (controller)
    {
        this.controller = controller;

        this.worker.onmessage = (e) => {
            if (e.data.error?.length!=0)
                console.log(e.data.error);

            if (e.data.positions?.length) {
                if (this.state === CWS.MotionStates.Running ||
                    this.state === CWS.MotionStates.Continue)
                {
                    this.controller.machine.setMotion(e.data);
                } else
                    this.controller.machine.updateMotion(e.data);
            }

            if (e.data.state) {
                const prevState = this.state;
                this.state  = e.data.state;
                this.atLine = e.data.atLine;

                if (this.state === CWS.MotionStates.Halted)
                    this._emitEvent("halted");
                else {
                    if (prevState > CWS.MotionStates.Running)
                        this._emitEvent("stopDebug");
                    this._emitEvent("idle");
                }

                if (e.data.positions.length) // might be a debug cmd
                    this.controller.updateWorkpieceDraw();
                this.controller.editor.setCurrentLine(this.atLine, this.state);

                if (e.data.state === CWS.MotionStates.Idle)
                    this.data = null;
            } else if (e.data.extra) {
                this.varVluCb(e.data.extra, e.data.value);
                this.varVluCb = null;
            }
            this.inflight = false;
        };
    };
