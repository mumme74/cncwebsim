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
		this.interpreter = new CWS.Interpreter(data.header.machine, this.parser);
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

		const oldPos = this.pos,
			  int = this.interpreter,
		      lineNr = this.interpreter.outputCommands[0].cmd.line.lineNumber;
		let cmd;
		while (cmd = int.getCommand()) {
			this.#calcCmd(cmd);

			// continue until we cleared this line.
			if (!int.outputCommands.length ||
				int.outputCommands[0].cmd.line.lineNumber !== lineNr
			)
				break;
			this.pos++;
		}

		this.state = this.interpreter.outputCommands.length ?
						MotionInterp.States.Halted : MotionInterp.States.Idle;

		const p = this.pos * 6, c = this.pos * 2;
		const res = {positions:this.positions.slice(oldPos * 6, p+6),
			         color:this.color.slice(oldPos*2, c +2),
			         error:this.errList, atLine: cmd.cmd.line.lineNumber-1,
					 state: this.state};
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
		while(!this.interpreter.stopRunning &&
			  (cmd=this.parser.getCommand()))
		{
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
		let lineNr = -1, peekLn = -1;
		const int = this.interpreter;
		for (; this.pos < end; ++this.pos) {
			const cmd = this.interpreter.getCommand();
			// only break on this commands that have onter line
			// G02-G03 produces many cmds for the same line
			lineNr = cmd.cmd.line.lineNumber-1;
			peekLn = int.outputCommands.length ?
				int.outputCommands[0].cmd.line.lineNumber : -1;
			if (useBrk &&
				this.breakPnts.indexOf(lineNr) !== -1 &&
				peekLn !== lineNr)
			{
				this.state = MotionInterp.States.Halted;
				break;
			}
			this.#calcCmd(cmd);
		}
		return {positions:this.positions.slice(0, this.pos*6),
				color:this.color.slice(0, this.pos*2)	,
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
