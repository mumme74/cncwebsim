/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 */

// states that motion can have, including debug
CWS.MotionStates = {
	Idle:"idle", Running:"running", Continue: "continue",
	Next:"next", StepOver:"stepover", Halted: "halted"
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
	};

CWS.Motion.prototype.constructor = CWS.Motion;

CWS.Motion.prototype.register

CWS.Motion.prototype.run = function ()
	{
		if (this.state === CWS.MotionStates.Idle)
		{
			this.postMessage(CWS.MotionStates.Running);
		}
	};

CWS.Motion.prototype.contin = function ()
    {
		if (this.state === CWS.MotionStates.Idle ||
			this.state === CWS.MotionStates.Halted)
		{
			this.postMessage(CWS.MotionStates.Continue);
		}
	}

CWS.Motion.prototype.next = function ()
	{
		if (this.state === CWS.MotionStates.Halted)
			this.postMessage(CWS.MotionStates.Next);
	}

CWS.Motion.prototype.stepOver = function ()
	{
		if (this.state === CWS.MotionStates.Halted)
			this.postMessage(CWS.MotionStates.StepOver);
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

CWS.Motion.prototype.postMessage = function (state)
	{
		if (!this.inflight && this.data)
			{
				this.inflight = true;
				this.state = state;
				this.worker.postMessage({
					...this.data, state, breakPnts: this.breakPnts});
			}
	};

CWS.Motion.prototype.setController = function (controller)
	{
		this.controller = controller;
		var _this=this;
		this.worker.onmessage = function (e)
		{
			if (e.data.error.length!=0)
				console.log(e.data.error);

			_this.state = e.data.state;
			_this.atLine   = e.data.atLine;

			_this.controller.machine.setMotion(e.data);
			_this.controller.updateWorkpieceDraw();
			_this.controller.editor.setCurrentLine(_this.atLine);

			if (e.data.state === CWS.MotionStates.Idle)
				_this.data = null;
			_this.inflight = false;
		};
	};
