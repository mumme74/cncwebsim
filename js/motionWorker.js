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
		Next:"next", StepOut:"stepout", Halted: "halted",
		Stop:"stop"
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
		this.noMoveCmdCnt = 0;
		this.interpreter.errList = this.errList;
	}

	onmessage(ev) {
		if (ev.data.extra?.startsWith('#')) {
			const varName = ev.data.extra;
			const vlu = this.interpreter.parameterVlu(varName);
			return postMessage({extra:varName, value: vlu, error:[]});
		}
		var result = {error:[{line:-1, msg:"Unrecognized command"}]};
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
		case MotionInterp.States.StepOut:
			result = this.stepOut();
			break;
		case MotionInterp.States.Stop:
			result = this.stop();
			break;
		case MotionInterp.States.Idle: // fallthrough
		default:
			this.state = MotionInterp.States.Idle;
		}
		postMessage(result);
	}

	run() {
		this.#parseCode();
		this.#runAllCmds();
		const res = this.#calcAllCmds(
			this.interpreter.outputCommands.length, false, -1);
		return res;
	}

	contin() {
		if (this.state === MotionInterp.States.Idle) {
			this.interpreter.debugMode = true;
			this.#parseCode();
			this.#runAllCmds(); // need to run all cmds to get commands length
		}
		const res = this.#calcAllCmds(
			this.interpreter.outputCommands.length, true, -1);
		return res;
	}

	next() {
		if (!this.interpreter.outputCommands.length) {
			this.state = MotionInterp.States.Idle;
			return {positions:[], color:[],error:this.errList,
		            atLine: -1, state: this.state};
		}

		const oldPos = this.interpreter.getPos() - this.noMoveCmdCnt,
			  int = this.interpreter,
		      lineNr = this.interpreter.outputCommands[
					this.interpreter.getPos()]?.cmd.line.lineNumber;
		if (lineNr === undefined) {
			this.state = MotionInterp.Idle; // already at EOF
			lineNr = -1;
		}

		let cm, cmd;
		while (cm = int.getCommand()) {
			cmd = cm; // ensure we have last command even when we are end
			if (cmd.noMoveCmdCnt)
				this.noMoveCmdCnt++;
			else
				this.#calcCmd(cmd);

			// continue until we cleared this line.
			if (cmd.cmd.line.lineNumber !== lineNr)
				break;
		}

		this.state = this.interpreter.outputCommands.length ?
						MotionInterp.States.Halted : MotionInterp.States.Idle;

		const endPos = this.interpreter.getPos() - this.noMoveCmdCnt;
		const p = endPos * 6, c = endPos * 2;
		const res = {positions:this.positions.slice(oldPos * 6, p),
			         color:this.color.slice(oldPos*2, c),
			         error:this.errList, atLine: cmd.cmd.line.lineNumber-1,
					 state: this.state};
		return res;
	}

	stepOut() {
		if (!this.interpreter.outputCommands.length) {
			this.state = MotionInterp.States.Idle;
			return {positions:[], color:[],error:this.errList,
		            atLine: -1, state: this.state};
		}
		const startIdx = this.interpreter.getPos();
		const curLine = this.#getCurrentCmd().cmd.line.lineNumber;

		let cmd;
		while (cmd = this.interpreter.getCommand()) {
			if (cmd.ctype === 'm' && cmd.number === 99)
				break;
		}

		const end = this.interpreter.getPos();
		this.interpreter.setPos(startIdx);

		return this.#calcAllCmds(end+1, true, curLine);
	}

	stop() {
		this.state =  MotionInterp.States.Idle;
		return {};
	}

	#getCurrentCmd() {
		const pos = this.interpreter.getPos();
		if (pos < this.interpreter.outputCommands.length)
			return this.interpreter.outputCommands[pos];
		return -1;
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

	#calcAllCmds(end, useBrk, ignoreBrkPntLine) {
		let lineNr = -1, peekLn = -1, cmd;
		const int = this.interpreter,
		      startPos = int.getPos() - this.noMoveCmdCnt;
		end = Math.min(end, int.outputCommands.length);
		while (int.getPos() < end) {
			cmd = this.interpreter.getCommand();
			// only break on this commands that have another line
			// G02-G03 produces many cmds for the same line
			lineNr = cmd.cmd.line.lineNumber;
			peekLn = int.outputCommands.length > int.getPos() ?
				int.outputCommands[int.getPos()].cmd.line.lineNumber : -1;
			if (useBrk &&
				this.breakPnts.indexOf(lineNr) !== -1 &&
				peekLn !== lineNr && peekLn !== ignoreBrkPntLine)
			{
				this.state = MotionInterp.States.Halted;
				break;
			}
			if (cmd.noMove) // might be a debugcmd
				this.noMoveCmdCnt++;
			else
				this.#calcCmd(cmd);
		}
		const endPos = int.getPos() - this.noMoveCmdCnt;
		return {positions:this.positions.slice(startPos*6, endPos * 6),
				color:this.color.slice(startPos*2, endPos*2),
			    error:this.errList,
				atLine: lineNr < peekLn || !cmd ? lineNr : cmd.cmd.line.lineNumber,
				state: this.state};
	}

	#calcCmd(cmd) {
		const i = (this.interpreter.getPos() - this.noMoveCmdCnt) * 6,
		      c = (this.interpreter.getPos() - this.noMoveCmdCnt) * 2;
		this.positions[ i + 0 ] = cmd.x0;
		this.positions[ i + 1 ] = cmd.y0;
		this.positions[ i + 2 ] = cmd.z0;

		this.positions[ i + 3 ] = cmd.x1;
		this.positions[ i + 4 ] = cmd.y1;
		this.positions[ i + 5 ] = cmd.z1;

		this.color[c]   = cmd.number;
		this.color[c+1] = cmd.number;
	}
};

const motionObj = new MotionInterp();

onmessage = (ev) => {
	if (motionObj.state === MotionInterp.States.Idle)
		motionObj.init(ev.data);
	 motionObj.onmessage(ev);
};
