/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 */


var CWS = {};

importScripts("parser.js");
importScripts("interpreter.js");

class MotionInterp {
	// states that motion can have, including debug
	static States = {
		Idle:"idle", Running:"running", Continue: "continue",
		Next:"next", StepOver:"stepover", Halted: "halted"
	};

	constructor() {
		this.state       = MotionInterp.States.Idle;
	}

	init(data) {
		this.parser      = new CWS.Parser();
		this.interpreter = new CWS.Interpreter(data.header.machine);
		this.code        = data.code;
		this.breakPnts   = data.breakPnts.sort();
		this.errList     = [];
		this.pos         = 0;
	}

	onmessage(ev) {
		var result = "OK";
		switch (ev.data.state) {
		case MotionInterp.States.Running:
			result = this.run();
			break;
		case MotionInterp.States.Continue:
			result = this.contin();
			break;
		case MotionInterp.States.Next:
			result = this.next();
			break;
		case MotionInterp.States.StepOver:
			result = this.stepOver();
			break;
		case MotionInterp.States.Idle: // fallthrough
		default:
			state = MotionInterp.States.Idle;
		}
		postMessage(result);
	}

	run() {
		this.#parseCode();
		this.#runAllCmds();
		const res = this.#calcAllCmds(
			this.pos + this.interpreter.outputCommands.length, false);
		return res;
	}

	contin() {
		if (this.state === MotionInterp.States.Idle) {
			this.#parseCode();
			this.#runAllCmds(); // need to run all cmds to get commands length
		}
		const res = this.#calcAllCmds(
			this.pos + this.interpreter.outputCommands.length, true);
		return res;
	}

	next() {
		if (!this.interpreter.outputCommands.length) {
			this.state = MotionInterp.States.Idle;
			return {positions:[], color:[],error:this.errList,
		            atLine: -1, state: this.state};
		}

		const cmd = this.interpreter.getCommand();
		this.#calcCmd(cmd);

		this.state = this.interpreter.outputCommands.length ?
						MotionInterp.States.Halted : MotionInterp.States.Idle;

		const p = this.pos * 6, c = this.pos * 2;
		const res = {positions:this.positions.slice(p, p+6),
			         color:this.color.slice(c, c +2),
			         error:this.errList, atLine: cmd.cmd.line.lineNumber-1,
					 state: this.state};
		this.pos++;
		return res;
	}

	stepOver() {
		// need implement cycles first.
	}

	#parseCode() {
		try {
			this.parser.parseCode(this.code, this.errList);
		} catch(e) {
			this.errList.push(e);
		}
	}

	#runAllCmds() {
		let cmd;
		while(cmd=this.parser.getCommand()) {
			try {
				this.interpreter.runCommand(cmd);
			} catch(e) {
				this.errList.push(e);
			}
		}

		let l = this.interpreter.outputCommands.length;
		this.positions = new Float32Array(l * 2 * 3);
		this.color = new Float32Array(l * 2);
	}

	#calcAllCmds(end, useBrk) {
		let lineNr = -1;
		for (; this.pos < end; ++this.pos) {
			const cmd = this.interpreter.getCommand();
			lineNr = cmd.cmd.line.lineNumber-1;
			if (useBrk, this.breakPnts.indexOf(lineNr) !== -1) {
				this.state = MotionInterp.States.Halted;
				break;
			}
			this.#calcCmd(cmd);
		}
		return {positions:this.positions, color:this.color,
			    error:this.errList, atLine: lineNr,
				state: this.state};
	}

	#calcCmd(cmd) {
		const i = this.pos * 6,
		      c = this.pos * 2;
		this.positions[ i + 0 ] = cmd.x0;
		this.positions[ i + 1 ] = cmd.y0;
		this.positions[ i + 2 ] = cmd.z0;

		this.positions[ i + 3 ] = cmd.x1;
		this.positions[ i + 4 ] = cmd.y1;
		this.positions[ i + 5 ] = cmd.z1;

		this.color[c]   = cmd.ctype;
		this.color[c+1] = cmd.ctype;
	}
};

const motionObj = new MotionInterp();

onmessage = (ev) => {
	if (motionObj.state === MotionInterp.States.Idle)
		motionObj.init(ev.data);
	 motionObj.onmessage(ev);
};
