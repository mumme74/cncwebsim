"use strict"
/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 * @author Fredrik Johansson / github.com/mumme74
 */

CWS.Interpreter = function (machine, parser)
	{
		// Mill - Mill, Lathe - Lathe, 3D Printer - Printer
		this.machineType = machine.mtype;
		this.parser = parser;
		this.debugMode = false;
		this.modal =
		{
			motion:0,                  // {G0,G1,G2,G3,G38.2,G80}
			feed_rate_mode:94,         // {G93,G94}
			units:1.0,                 // {G20,G21}  1in = 25.4mm
			distance:90,               // {G90,G91}
			plane_select:0,            // {G17,G18,G19}
			tool_length:0,             // {G43.1,G49}
			coord_select:0,            // {G54,G55,G56,G57,G58,G59}
			program_flow:0,            // {M0,M1,M2,M30}
			coolant:0,                 // {M7,M8,M9}
			spindle:0,                 // {M3,M4,M5}
			cutter_comp:40			   // {G40,G41,G42}
		};
		this.settings =
		{
			g0_speed:10,			   // Speed for G0
			spindle_speed:0,           // RPM
			feed_rate:null,            // Millimeters/min
			feed_rate93:0,             // 1/F min
			tool:0,                    // Tracks tool number.
			line_number:0,             // Last line number sent
			machine_postion_g53:false, // If true the next modal command will use absolute position and set to false again
			coord_system:null,         // Current work coordinate system (G54+). Stores offset from absolute machine
			                           // position in mm. Loaded from EEPROM when called.
			coord_offset:{x:0,y:0,z:0},// Retains the G92 coordinate offset (work coordinates) relative to
			                           // machine zero in mm. Non-persistent. Cleared upon reset and boot.
			tool_length_offset:0,      // Tracks tool length offset value when enabled.

			sys_abort:false,
			sys_rt_exec_state:0,
			sys_rt_exec_alarm:0,
			sys_suspend:false,
			pos28:machine.home1,
			pos30:machine.home2,
		};
		this.toolTable = {};
		this.coordinateSystemTable =
		[								// P0 active system, P1-P6 = G54-G59
			{x:0,y:0,z:0,r:0},{x:0,y:0,z:0,r:0},{x:0,y:0,z:0,r:0},{x:0,y:0,z:0,r:0},
			{x:0,y:0,z:0,r:0},{x:0,y:0,z:0,r:0},{x:0,y:0,z:0,r:0}
		];
		this.position = this.settings.pos28;  // Where the interpreter considers the tool to be at this point in the code

		this.outputCommands = []; 		// {time:t,comand:cdata}
		// global parameters reached from everywhere
		this.glblParameters = {};
		this.callFrameStack = [];
		this.pushCallFrame(null); // Push the file scope locals

        // Coordinate system is P0
        this.settings.coord_system=this.coordinateSystemTable[0];

        this.N_ARC_CORRECTION = 0;

		this.invertRadius = false;
		if (this.machineType=="Lathe")
		{
			this.invertRadius = true;
			this.g18({number:18});
		}
		else if (this.machineType=="Mill")
		{
			this.g17({number:17});
		}
		else if (this.machineType=="3D Printer")
		{
			this.position.z=0;
			this.g17({number:17});
		}
		this.stopRunning = false;
		this._iter = 0;
	}

// this pushes a procedure local scope onto calling frame stack
CWS.Interpreter.prototype.pushCallFrame = function (callerCmdPos)
	{
		this.callFrameStack.push({
			parameters: {},
			callerPos:callerCmdPos,
			'while': {}
		});
	};

// when returning from a procedure
CWS.Interpreter.prototype.popCallFrame = function ()
	{
		if (this.callFrameStack.length > 1) {
			const frm = this.callFrameStack.pop();
			this.parser.setPos(frm.callerPos);
		}
	}

CWS.Interpreter.prototype.runCommand = function (prgCmd)
	{
		if (this.stopRunning)
			return;
		else if (prgCmd.ctype === '=')
			return this.parameterAssign(prgCmd);
		else if (prgCmd.ctype.length > 1)
			return this[prgCmd.ctype](prgCmd); // if, while, goto ...
		return this[prgCmd.ctype+prgCmd.number](prgCmd);
	};

CWS.Interpreter.prototype.getCommand = function ()
	{
		if (this.outputCommands.length > this._iter)
			return this.outputCommands[this._iter++];
		return null;
	};

CWS.Interpreter.prototype.getPos = function()
	{
		return this._iter;
	}

CWS.Interpreter.prototype.setPos = function(newIdx)
	{
		this._iter = newIdx;
	}

// Create a new entry in the tool table
CWS.Interpreter.prototype.createTooTableEntry = function (tnumber)
	{
		// tnumber	Tool number
		// x,y,z 	Axis offset
		// R 		Radius of tool
		// I 		Front angle (lathe)
		// J 		Back angle (lathe)
		// Q 		Orientation (lathe)
		this.toolTable[tnumber]={x:0,y:0,z:0,i:0,j:0,q:0,r:0};
	};
// If a G code is not implemented
CWS.Interpreter.prototype.g9999  = function (prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
	};
// If a M code is not implemented
CWS.Interpreter.prototype.m9999  = function (prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype._islocal = function (name)
	{
		// a global variable starts with '<_' or > 30
		return isNaN(+name) ? name[2] !== '_' : +name < 31;
	}

CWS.Interpreter.prototype.parameterVlu = function (name, cmd)
	{
		if (this._islocal(name))
			return this.callFrameStack[this.callFrameStack.length-1]
						['parameters'][name];
		else if (name in this.glblParameters)
			return this.glblParameters[name];
		throw new ErrorInterpreter(cmd.line.lineNumber,
				`Using ${name} uninitialised`);
	};

CWS.Interpreter.prototype.exprVlu = function (expr, cmd)
	{
		if (!isNaN(expr))
			return expr;
		if (typeof expr === 'string')
			return this.parameterVlu(expr, cmd);
		// need to run calculation
		const getVlu = (exp)=>{
			if (Array.isArray(exp))
				return calculate(exp);
			if (typeof exp === 'string')
				return this.parameterVlu(exp, cmd);
			return exp;
		}
		const calculate = (subExpr)=>{
			// recursivly figure out left part
			const left = Array.isArray(subExpr[1]) ?
				calculate(subExpr[1]) : getVlu(subExpr[1]);
			const right = Array.isArray(subExpr[2]) ?
				calculate(subExpr[2]) : getVlu(subExpr[2]);
			switch (subExpr[0]) {
			case '**':  return Math.pow(left, right);
			case '*':   return left * right;
			case '+':   return left + right;
			case '-':   return left - right;
			case 'eq':  return left === right;
			case 'ne':  return left !== right;
			case 'gt':  return left > right;
			case 'lt':  return left < right;
			case 'ge':  return left >= right;
			case 'le':  return left <= right;
			case 'and': return left && right;
			case 'or':  return left || right;
			case 'xor': return (left && !right) || (!left && right);
			case '/':
				if (right === 0)
					throw new CWS.ErrorInterpreter(cmd.lineNumber,
						`Error: division by zero ${ĺeft} / ${right}`,
						{left, right});
				return left / right;
			case 'mod':
				if (right === 0)
					throw new CWS.ErrorInterpreter(cmd.lineNumber,
						`Error: division by zero ${ĺeft} MOD ${right}`,
						{left, right});
				return left % right;
			}
		}

		return calculate(expr);
	};

CWS.Interpreter.prototype.isObject = function (obj)
	{
		return typeof obj === 'object' && obj !== null && ! Array.isArray(obj);
	};

// evaluate all expressions in cmd params
CWS.Interpreter.prototype.evalCmdExprs = function (cmd)
	{
		const retObj = {};
		const ignore = ['line'];
		const doObj = (obj, ret)=>{
			for (const [key, vlu] of Object.entries(obj)) {
				if (ignore.indexOf(key) !== -1)
					ret[key] = vlu;
				else if (this.isObject(vlu)) {
					ret[key] = {};
					doObj(vlu, ret[key]);
				} else if (Array.isArray(vlu))
					ret[key] = this.exprVlu(vlu, cmd);
				else if (typeof vlu === 'string')
					ret[key] = this.parameterVlu(vlu, cmd)
				else
					ret[key] = vlu;
			}
		}
		doObj(cmd, retObj);
		return retObj;
	};

CWS.Interpreter.prototype.coordinatesToAbsolute  = function (prgCmd)
	{
		const cmd = this.evalCmdExprs(prgCmd); // also takes a copy

		if (this.settings.machine_postion_g53==true)
		{
			cmd.param.xyz.x = cmd.param.xyz.x===undefined?this.position.x:cmd.param.xyz.x*this.modal.units;
			cmd.param.xyz.y = cmd.param.xyz.y===undefined?this.position.y:cmd.param.xyz.y*this.modal.units;
			cmd.param.xyz.z = cmd.param.xyz.z===undefined?this.position.z:cmd.param.xyz.z*this.modal.units;
			return;
		}
		if (this.modal.distance==91)
		{
			cmd.param.xyz.x = cmd.param.xyz.x===undefined?this.position.x:cmd.param.xyz.x*this.modal.units+this.position.x;
			cmd.param.xyz.y = cmd.param.xyz.y===undefined?this.position.y:cmd.param.xyz.y*this.modal.units+this.position.y;
			cmd.param.xyz.z = cmd.param.xyz.z===undefined?this.position.z:cmd.param.xyz.z*this.modal.units+this.position.z;
		}
		else
		{
			cmd.param.xyz.x = cmd.param.xyz.x===undefined?this.position.x:cmd.param.xyz.x+this.settings.coord_system.x+this.settings.coord_offset.x;
			cmd.param.xyz.y = cmd.param.xyz.y===undefined?this.position.y:cmd.param.xyz.y+this.settings.coord_system.y+this.settings.coord_offset.y;
			cmd.param.xyz.z = cmd.param.xyz.z===undefined?this.position.z:cmd.param.xyz.z+this.settings.coord_system.z+this.settings.coord_offset.z;
		}
		return cmd;
	}

// Sets the feed rate. If in G93 mode the value will be calculated after the G1|G2|G3 functions
CWS.Interpreter.prototype.f0  = function (prgCmd)
	{
		const feed = this.exprVlu(prgCmd.param['f'], prgCmd);
		if (this.modal.feed_rate_mode==93)
			this.settings.feed_rate93=feed;
		else
			this.settings.feed_rate=feed;
		return true;
	};
// For 3D printers S word can be time,temperature,voltage etc.
// For the other machines S is the spindle speed and it cannot be negative
CWS.Interpreter.prototype.s0  = function (prgCmd)
	{
		if (this.machineType!='3D Printer') {
			const speed = this.exprVlu(prgCmd.s, prgCmd);
			if (speed < 0)
				throw new CWS.ErrorInterpreter(prgCmd.line.lineNumber,
					"Wrong S number. S cannot be a negative number",
					prgCmd.line.rawLine);
			else
				this.spindle_speed=speed;
		};
		return true;
	};

CWS.Interpreter.prototype.move3dPrinter  = function (prgCmd)
	{
	if (this.machineType=="3D Printer" && prgCmd.param.a==undefined && prgCmd.param.e==undefined )
	{
		const cmd = this.coordinatesToAbsolute(prgCmd);
		this.position.x=cmd.param.xyz.x;
		this.position.y=cmd.param.xyz.y;
		this.position.z=cmd.param.xyz.z;
		return true;
	}
	return false;
	}

CWS.Interpreter.prototype._makeCmdFromPrgCmd = function(prgCmd, ctype)
	{
		const cmd = this.coordinatesToAbsolute(prgCmd);
		return this._makeOutCmd(cmd, ctype,
			cmd.param.xyz.x, cmd.param.xyz.y, cmd.param.xyz.z);
	}

CWS.Interpreter.prototype.pushNoMoveCmd = function(cmd)
	{
		if (this.debugMode)
			this.outputCommands.push({
				cmd, ctype:cmd.ctype, number:cmd.number,
				noMove:true // a purely debug cmd
			});
	}

CWS.Interpreter.prototype._makeOutCmd = function(prgCmd, number, x1, y1, z1)
	{
		const newCmd = {
			x0:this.position.x, x1,
			y0:this.position.y, y1,
			z0:this.position.z, z1,
			ctype:'g', number,
			cmd: prgCmd
		}

		this.position.x = x1;
		this.position.y = y1;
		this.position.z = z1;

		return newCmd;
	}

CWS.Interpreter.prototype.g0  = function (prgCmd)
	{
	if (this.move3dPrinter(prgCmd))
		return;
	const cmd = this._makeCmdFromPrgCmd(prgCmd, 0);

	if (this.machineType=="3D Printer" && cmd.param.a==undefined && cmd.param.e==undefined )
		return;
	this.outputCommands.push(cmd);
	};

CWS.Interpreter.prototype.g1  = function (prgCmd)
	{
		if (this.move3dPrinter(prgCmd))
			return;

		const outCmd = this._makeCmdFromPrgCmd(prgCmd, 1);
		this.outputCommands.push(outCmd);
	};


CWS.Interpreter.prototype._arc  = function (prgCmd, gNumber)
	{
	if (this.move3dPrinter(prgCmd))
		return;

	const cmd = this.coordinatesToAbsolute(prgCmd);

	// make Americans happy,
	for (const k of Object.keys(cmd.param.ijk))
		cmd.param.ijk[k] *= this.modal.units;

	// relative coordinates
    const x = cmd.param.xyz[this.axisXYZ_0] - this.position[this.axisXYZ_0],
          y = cmd.param.xyz[this.axisXYZ_1] - this.position[this.axisXYZ_1],
          z = cmd.param.xyz[this.axisXYZ_linear],
	      startZ = this.position[this.axisXYZ_linear];

	if (cmd.param.r !== undefined)
	{
		cmd.param.r *= this.modal.units;
		const r = cmd.param.r;
		if (this.invertRadius)
			gNumber = gNumber == 3 ? 2 : 3;

		// Pythagoras
		const dist = Math.sqrt(x*x + y*y);
		if (cmd.param.r < dist / 2)
			throw new CWS.ErrorInterpreter(cmd.line.lineNumber,
				"Radius too small", cmd.line.rawLine);

		// using consine theorem to find angle of th pie slice formed by trangle
		// between start and end point and where arc cerntoer should be
		// Fing out angle between start and end, divide by 2, subtract with result
		// above divided by 2. Should now have angle from startpoint to arc center
		// use normal sine cosine and radius to figure out where centerpoint
		// should be.
		//   l is length (distance) between start and end
		//   o is angle from curpos and endpos     => o = atan2(y,x)
		//   v is angle of the triangle pie slice (start-end-arccenter)
		//        => v = acos(r²+r²-l²) /2r²) ; cosine theorem
		//   b is angle from cur pos line to arc center line in pie, should be half o
		//        => b = o / 2
		//   a is angle from cur pos and arc center point.
		//        => a = b + v/2
		// center pnt.x = sin a * r, pnt.y = cos a * r

		const oAngle = gNumber === 3 ? Math.atan2(x,y) : Math.atan2(y,x),
		      r2 = r*r,
			  lDist2 = dist*dist,
			  vAngle = Math.acos((r2+r2-lDist2) / (2*r2)),
			  aAngle = Math.PI - oAngle - vAngle / 2;

		const center = {
			x: Math.sin(aAngle) * r,
			y: Math.cos(aAngle) * r
		};

		if (isNaN(aAngle))
			throw CWS.ErrorInterpreter(cmd.line.lineNumber,
				`Impossible to find center point of arc with given parameters`);

        cmd.param.ijk[this.axisIJK_0] = gNumber === 3 ? center.y : center.x;
        cmd.param.ijk[this.axisIJK_1] = gNumber === 3 ? center.x : center.y;
	}

	// Where ijk resides in 3d space
	const centerPos = {
		x:this.position[this.axisXYZ_0] + (cmd.param.ijk[this.axisIJK_0] ?? 0),
		y:this.position[this.axisXYZ_1] + (cmd.param.ijk[this.axisIJK_1] ?? 0),
		z:this.position[this.axisXYZ_linear] + (cmd.param.ijk[this.axisIJK_2] ?? 0)
	};
	// Radius vector from center to current location
	const centerToStart = {
		x:-(cmd.param.ijk[this.axisIJK_0] ?? 0),
		y:-(cmd.param.ijk[this.axisIJK_1] ?? 0),
		z:-(cmd.param.ijk[this.axisIJK_linear] ?? 0)
	};
	// how far from centerpos to end in all 3 axis
	const centerToEnd = {
		x:(cmd.param.xyz[this.axisXYZ_0] ?? 0) - centerPos.x,
		y:(cmd.param.xyz[this.axisXYZ_1] ?? 0) - centerPos.y,
		z:(cmd.param.xyz[this.axisXYZ_linear] ?? 0) - centerPos.z
	};

	// console.log(cmd.line.lineNumber, "s", centerToStart, "c", centerPos, "e", centerToEnd, "ijk",cmd.param.ijk);
	//   const outCmd1 = this._makeOutCmd(cmd, gNumber, centerPos.x, centerPos.y, centerPos.z);
	//   this.outputCommands.push(outCmd1);
	//   const outCmd2 = this._makeOutCmd(cmd, gNumber, cmd.param.xyz.x, cmd.param.xyz.y, centerPos.z);
	//   this.outputCommands.push(outCmd2);

	const radius2D = Math.sqrt(Math.pow(centerToStart.x,2)+Math.pow(centerToStart.y,2));
	if (radius2D <= 0.0002)
		throw new CWS.ErrorInterpreter(cmd.line.lineNumber,
			`Radius to small`);
	const radius3D = radius2D * Math.cos(Math.asin(centerToStart.z/radius2D));
	if (radius3D <= 0.0 || isNaN(radius3D))
		throw new CWS.ErrorInterpreter(cmd.line.lineNumber,
			`G${gNumber} K value makes radius disappear`);



	const oneRev = 2 * Math.PI;
	const startToCenterAngle = Math.atan2(centerToStart.y, centerToStart.x);
	const endToCenterAngle   = Math.atan2(centerToEnd.y, centerToEnd.x);
	let arcAngle = startToCenterAngle - endToCenterAngle;
	if (gNumber === 3 && arcAngle > 0)
		arcAngle = arcAngle - oneRev;
	else
	if (gNumber === 2 && arcAngle < 0)
		arcAngle = oneRev + arcAngle;
	if (arcAngle === 0.0)
		arcAngle = gNumber === 3 ? -oneRev : oneRev;

	// We split to segments (algorithm generally works like this)
	//   A is minimum segment arc tolerance, ex: 0.2deg
	//   L is minimum travel allowed in a segment
	//   v is the angle of the arc             => v=atan2(y,x)
	//   l is the length traveled in arc       => l=(2*r*pi)/v
	//   v1 is the angle for each segment      => v1 = A
	//   n is number segments                  => n=|v/A|
	//   l1 is length traveled in each segment => l1=l/n
	//
	//   if l1 < L reduce num of segments
	//      recaluculate n                     => n=|l/L|
	//      recalculate v1                     => v1=v/n
	//      recalculate l1                     => l1=l/n

  	const minTravel = 0.0002, // mm, L in description
		  // min angle in radians, A in desc.
	      minAngle  = (0.2 * Math.PI) / 180,
		  // total travel, l in desc.
		  travelLen = (2*radius3D*Math.PI) / arcAngle;

		  // angle per segment, v1 in desc
	let segmAngle = arcAngle >= 0 ? minAngle : -minAngle,
	      // How many segments, n in desc
	    numSegm = Math.abs(arcAngle / segmAngle),
		  // how long a segment is
		segmLen = travelLen / numSegm;

	if (Math.abs(segmLen) < minTravel) {
		numSegm = travelLen / minTravel;
		segmLen = arcAngle / numSegm;
	}

	const moveZPerSegment = (z - this.position[this.axisXYZ_linear]) / numSegm;

	// for rotating a matrix in the loop
    const cosTmp = 2.0 - segmAngle*segmAngle;
    const sin_T = segmAngle*0.16666667*(cosTmp + 4.0);
    const cos_T = cosTmp * 0.5;

    let sin_Ti, cos_Ti, count = 0,
	    pos = {
			x: centerPos.x,
			y: centerPos.y,
			z: centerPos.z
		};

    for (let i = 1; i <= numSegm; i++)
    { // Increment (segments-1).

      if (count < this.N_ARC_CORRECTION)
      {
        // Apply vector rotation matrix. ~40 usec
        const r_axisi = pos.x * sin_T + pos.y * cos_T;
        pos.x = pos.x * cos_T - pos.y * sin_T;
        pos.y = r_axisi;
        count++;
      }
      else
      {
        // Arc correction to radius vector. Computed only every N_ARC_CORRECTION increments. ~375 usec
        // Compute exact location by applying transformation matrix from initial radius vector(=-offset).
        cos_Ti = Math.cos(i * segmAngle - startToCenterAngle);
        sin_Ti = -Math.sin(i * segmAngle - startToCenterAngle);
        pos.x = centerPos.x + radius3D * cos_Ti;
        pos.y = centerPos.y + radius3D * sin_Ti;
        count = 0;
      }

      pos.z = moveZPerSegment * i + startZ;
	  const outCmd = this._makeOutCmd(cmd, gNumber,
									  pos[this.axisXYZ_0],
									  pos[this.axisXYZ_1],
									  pos[this.axisXYZ_linear]);
	  this.outputCommands.push(outCmd);
    }

	if (!cmd.param.ijk[this.axisIJK_linear] && (
		Math.abs(this.position.x - cmd.param.xyz.x) > 0.2 ||
        Math.abs(this.position.y - cmd.param.xyz.y) > 0.2 ||
		Math.abs(this.position.z - cmd.param.xyz.z) > 0.2)
	)
		this.errList.push(new CWS.ErrorInterpreter(cmd.line.lineNumber,
			`Arc does not close properly`));

	const outCmd = this._makeOutCmd(
		cmd, gNumber, cmd.param.xyz.x, cmd.param.xyz.y, cmd.param.xyz.z);

	this.outputCommands.push(outCmd);

  	//this.position.x = cmd.param.xyz.x;
  	//this.position.y = cmd.param.xyz.y;
	//this.position.z = cmd.param.xyz.z;
	}

CWS.Interpreter.prototype.g2  = function (prgCmd)
	{
		this._arc(prgCmd, 2);
	};

CWS.Interpreter.prototype.g3  = function (prgCmd)
	{
		this._arc(prgCmd, 3);
	};

CWS.Interpreter.prototype.g4  = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.g10 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	var l=Math.round(prgCmd.param['l']);
	delete prgCmd.param['l'];
	var p=Math.round(prgCmd.param['p']);
	delete prgCmd.param['p'];
	// Set Tool Table
	if (l==1)
	{
		if (this.toolTable[p] === undefined)
			throw new CWS.ErrorInterpreter(prgCmd.line.lineNumber,
				"Wrong G10 L1. Invalid P word", prgCmd.line.rawLine);
		for (var k in prgCmd.param)
			this.toolTable[p][k]=prgCmd.param[k];
	}
	else if(l==2)
	{
		if (p<0 || p>6)
			throw new CWS.ErrorInterpreter(prgCmd.line.lineNumber,
				"Wrong G10 L2. Invalid P word",prgCmd.line.rawLine);
		for (var k in prgCmd.param)
			this.coordinateSystemTable[p][k]=prgCmd.param[k];
	}
	// L10,L11 Not implemented
	};

CWS.Interpreter.prototype.g17 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.plane_select=prgCmd.number;
	this.axisXYZ_0='x';
	this.axisXYZ_1='y';
	this.axisXYZ_linear='z';
	this.axisIJK_0='i';
	this.axisIJK_1='j';
	this.axisIJK_linear='k';
	};

CWS.Interpreter.prototype.g18 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.plane_select=prgCmd.number;
	this.axisXYZ_0='x';
	this.axisXYZ_1='z';
	this.axisXYZ_linear='y';
	this.axisIJK_0='i';
	this.axisIJK_1='k';
	this.axisIJK_linear='j';
	};

CWS.Interpreter.prototype.g19 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.plane_select=prgCmd.number;
	this.axisXYZ_0='y';
	this.axisXYZ_1='z';
	this.axisXYZ_linear='x';
	this.axisIJK_0='j';
	this.axisIJK_1='k';
	this.axisIJK_linear='i';
	};

CWS.Interpreter.prototype.g20 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.modal.units = 25.4;
	};

CWS.Interpreter.prototype.g21 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.modal.units = 1.0;
	};
// Go to Predefined Position
// The parameter values are absolute machine coordinates in the native machine units
CWS.Interpreter.prototype.g28 = function (prgCmd)
	{
	const outCmd = this._makeCmdFromPrgCmd(prgCmd, 28);
	this.outputCommands.push(outCmd);
	};
// Go to Predefined Position
// The parameter values are absolute machine coordinates in the native machine units
CWS.Interpreter.prototype.g30 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.g40 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.modal.cutter_comp=40;
	};

CWS.Interpreter.prototype.g41 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.modal.cutter_comp=41;
	};

CWS.Interpreter.prototype.g42 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.modal.cutter_comp=42;
	};

CWS.Interpreter.prototype.g43 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.g49 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.g53 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.g54 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorInterpreter(this.lineNumber,
			"Wrong G54. Cutter compensation is on", this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[1];
	};

CWS.Interpreter.prototype.g55 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorInterpreter(this.lineNumber,
			"Wrong G55. Cutter compensation is on", this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[2];
	};

CWS.Interpreter.prototype.g56 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorInterpreter(this.lineNumber,
			"Wrong G56. Cutter compensation is on", this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[3];
	};

CWS.Interpreter.prototype.g57 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorInterpreter(this.lineNumber,
			"Wrong G57. Cutter compensation is on", this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[4];
	};

CWS.Interpreter.prototype.g58 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorInterpreter(this.lineNumber,
			"Wrong G58. Cutter compensation is on", this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[5];
	};

CWS.Interpreter.prototype.g59 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorInterpreter(this.lineNumber,
			"Wrong G59. Cutter compensation is on", this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[6];
	};

CWS.Interpreter.prototype.g61 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.g64 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.g90 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.modal.distance=90;
	};

CWS.Interpreter.prototype.g91 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.modal.distance=91;
	};

CWS.Interpreter.prototype.g92 = function (prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
		const cmd = this.evalCmdExprs(prgCmd);
		for (var k in cmd.param.xyz)
			this.settings.coord_offset[k]=cmd.param.xyz[k]*this.modal.units;
	};

CWS.Interpreter.prototype.g93 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.modal.feed_rate_mode=93;
	};

CWS.Interpreter.prototype.g94 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.modal.feed_rate_mode=94;
	this.settings.feed_rate=null;
	};

CWS.Interpreter.prototype.g98 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.g99 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m0	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m1	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m2	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m3	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m4	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m5	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m6	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m7	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m8	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m9	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m30	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	this.stopRunning = true;
	};

CWS.Interpreter.prototype.m48	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m49	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m60	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m82	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m83	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m86	= function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m97 = function (prgCmd)
	{
		const cmd = this.evalCmdExprs(prgCmd);
		const N = cmd.param.n,
		      L = cmd.param.l ? cmd.param.l : 1;
		if (!(N in this.parser.nLinesToLines))
			throw new CWS.ErrorInterpreter(cmd.line.lineNumber,
				`Procedure at : N${N} not found!`, cmd);
		const line = this.parser.nLinesToLines[N];
		const idx = this.parser.firstCmdFor(line);
		this._subRoutineLoop(L, idx, prgCmd);
	}

CWS.Interpreter.prototype.m98 = function (prgCmd)
	{
		const cmd = this.evalCmdExprs(prgCmd);
		const P = cmd.param.p,
		      L = cmd.param.l ? cmd.param.l : 1;
		if (!(P in this.parser.procedures))
			throw new CWS.ErrorInterpreter(cmd.line.lineNumber,
				`Procedure: O${P} not found!`, cmd);
		this._subRoutineLoop(L, this.parser.procedures[P], prgCmd);
	}

CWS.Interpreter.prototype._subRoutineLoop = function(loops, pos, prgCmd)
	{
		// loop L times
		for (let i = 0; i < loops;  ++i) {
			let cmd;
			this.pushNoMoveCmd(prgCmd);
			this.pushCallFrame(this.parser.pos());
			const frmLen = this.callFrameStack.length;
			this.parser.setPos(pos);
			while (this.callFrameStack.length == frmLen &&
				   (cmd=this.parser.getCommand()))
			{
				this.runCommand(cmd);
			}
		}
	};

CWS.Interpreter.prototype.m99 = function (prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
		this.popCallFrame();
	};

CWS.Interpreter.prototype.m104 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	};

CWS.Interpreter.prototype.m109 = function (prgCmd)
	{
	this.pushNoMoveCmd(prgCmd);
	}

CWS.Interpreter.prototype.goto = function (prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
		const cmd = this.evalCmdExprs(prgCmd);
		if (!(cmd.param.toLine in this.parser.nLinesToLines))
			throw new CWS.ErrorInterpreter(cmd.line.lineNumber,
				`Line N${cmd.param.toLine} not found.`, cmd);
		const line = this.parser.nLinesToLines[cmd.param.toLine];
		const idx = this.parser.firstCmdFor(line);
		this.parser.setPos(idx);
	}

CWS.Interpreter.prototype['if'] = function (prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
		const cmd = this.evalCmdExprs(prgCmd);
		if (!this.exprVlu(cmd.param.cond, cmd))
			this.parser.jumpForward(1);
		// else let rest of line play out
	}

CWS.Interpreter.prototype.then = function (prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
	}

CWS.Interpreter.prototype['while'] = function (prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
		const wstk = this.callFrameStack[this.callFrameStack.length-1]['while'],
			  cmd = this.evalCmdExprs(prgCmd),
			  curIdx = this.parser.pos();
		if (!(cmd.param.doNr in wstk)) {
			// setup loop for first run
			let endIdx = -1;
			// look up the end for this while
			for (let i = curIdx; i < this.parser.commands.length; ++i) {
				const c = this.parser.commands[i];
				if (c.ctype === 'end' && c.number === cmd.param.doNr) {
					endIdx = i;
					break;
				}
			}

			if (endIdx === -1)
				throw new CWS.ErrorInterpreter(cmd.line.lineNumber,
					`END${cmd.param.doNr} not found`);
			wstk[cmd.param.doNr] = {whileIdx:curIdx, endIdx};
		}

		// exit loop by jumping end +1
		if (!this.exprVlu(cmd.param.cond)) {
			this.parser.setPos(wstk[cmd.param.doNr].endIdx+1);
			delete wstk[cmd.param.doNr];
		}
	}

CWS.Interpreter.prototype.end = function (prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
		const wstk = this.callFrameStack[this.callFrameStack.length-1]['while'],
			  cmd = this.evalCmdExprs(prgCmd),
			  whObj = wstk[cmd.number];
	    if (!whObj)
			throw new CWS.ErrorInterpreter(cmd.line.lineNumber,
				`End without starting 'WHILE [...] DO${cmd.number}}`);
		this.parser.setPos(whObj.whileIdx-1); // jump back to while
	}

CWS.Interpreter.prototype.parameterAssign = function(prgCmd)
	{
		this.pushNoMoveCmd(prgCmd);
		const name = prgCmd.number,
		      vlu  = this.exprVlu(prgCmd.param['vlu']);
		if (this._islocal(name))
			this.callFrameStack[this.callFrameStack.length-1]
				['parameters'][prgCmd.number] = vlu;
		else
			this.glblParameters[prgCmd.number] = vlu;
		//console.log("Assigning ", prgCmd.number, prgCmd);
	}

// A list of all commands this interpreter supports.
CWS.Interpreter.prototype.commands = [
	{name: 'F',   description: "Set feed rate\nF100; 100mm/min"},
	{name: 'S',   description: "Set spindle speed\nS1000; 1000rpm"},
	{name: 'G0',  description: "Straight rapid move:\nG0 x y z"},
	{name: 'G1',  description: "Straight move:\nG0 x y z"},
	{name: 'G2',  description: "Move in an arc, clockwise:\nG2 x y r\nG2 x y i j k"},
	{name: 'G3',  description: "Move in an arc, counter clockwise:\nG3 x y r\nG3 x y i j k"},
	{name: 'G4',  description: "Dwell, wait for a time:\nG4 s1.5; paus in 1.5s\G4 p200; paus in 200ms"},
	{name: 'G10', description: "Move zero point:\nG10 L2 P1 x y z; workpiece\nG10 L20 P1; tool offset"},
	{name: 'G17', description: "Select XY plane for G2, G3"},
	{name: 'G18', description: "Select XZ plane for G2, G3"},
	{name: 'G19', description: "Select YZ plane for G2, G3"},
	{name: 'G20', description: "Imperial units (inches)"},
	{name: 'G21', description: "Metric units (millimeters)"},
	{name: 'G28', description: "Go to home position, example: tool change for"},
	{name: 'G30', description: "Go to secondary home position"},
	{name: 'G40', description: "Cancel tool compensation\nG40"},
	{name: 'G41', description: "Tool readius compensation left\nG41 P2; compensate for 4mm tool\nG41 d h i j k"},
	{name: 'G42', description: "Tool radius compensation right\nG42 P2; compensate for 4mm tool\nG42 d h i j k"},
	{name: 'G43', description: "Tool length compensation\nG43 H1 Z10.2; uses length 1 from tool table and moves 10.2mm from that"},
	{name: 'G49', description: "Cancel tool length compensation"},
	{name: 'G53', description: "Move to absolute position (Only this row)"},
	{name: 'G54', description: "Move to a predetermined fixture zero point (vise 1)"},
	{name: 'G55', description: "Move to a predetermined fixture zero point (vise 2)"},
	{name: 'G56', description: "Move to a predetermined fixture zero point (vise 3)"},
	{name: 'G57', description: "Move to a predetermined fixture zero point (vise 4)"},
	{name: 'G58', description: "Move to a predetermined fixture zero point (vise 5)"},
	{name: 'G59', description: "Move to a predetermined fixture zero point (vise 6)"},
	{name: 'G60', description: "Single direction move (anti backlash, compensate worn machine)"},
	{name: 'G61', description: "Stop mode, stop at every point (lessen impact of machine play)"},
	{name: 'G64', description: "Continous path mode, dont stop at every point"},
	{name: 'G90', description: "Absolute mode, all coordinates are relative to zero point"},
	{name: 'G91', description: "Incremental mode, all coordinates are relative to current position"},
	{name: 'G92', description: "Temporary work offset, for example tool wear, or misplaced workpiece"},
	{name: 'G93', description: "Feedrate based on time, instead of mm/min, let it take F time to finish time move"},
	{name: 'G94', description: "Change feedrate for subsequent commands uint/mm"},
	{name: 'G95', description: "Feedrate dependent on spindle speed, constant cutting velocity (lathes for example)"},
	{name: 'G98', description: "Mill: Canned cycle retract point to initial down move\nLathe: Feedrate per revolution."},
	{name: 'G99', description: "Mill: Canned cycle only retract to G01 down point."},
	{name: 'M0',  description: "Halt program until operator pushes continue"},
	{name: 'M1',  description: "Halt program if optional stop switch is enabled, else continue"},
	{name: 'M2',  description: "Program end, but leave tool change pallets"},
	{name: 'M3',  description: "Start spindle clockwise\nM3 S1000; turn on spndle at 1000rpm"},
	{name: 'M4',  description: "Start spindle counter-clokwise\nM4 S1000; turn on spindle oposite way"},
	{name: 'M5',  description: "Stop spindle from rotating"},
	{name: 'M6',  description: "Initiate tool change\nM6 T3; selects tool 3"},
	{name: 'M7',  description: "Coolant trhough spindle (if applicable)"},
	{name: 'M8',  description: "Coolant flow"},
	{name: 'M9',  description: "Stop coolant flow"},
	{name: 'M30', description: "End of program, stop program here.\nCallable procedures might be below this line."},
	{name: 'M48', description: "Allow feed and speed override by operator"},
	{name: 'M49', description: "Turn off M48, no operator override"},
	{name: 'M60', description: "Pallet change (Switch workpiece holding fixture)"},
	{name: 'M82', description: "Unclamp tool or switch to spindle/extruder to absolute mode"},
	{name: 'M83', description: "Switch extruder or spindle to relative mode"},
	{name: 'M86', description: "Clamp tool"},
	{name: 'M97', description: "Local subprogram call\nM97 N100 L2; calls program at N100 2 times (loop=2)"},
	{name: 'M98', description: "Call procedure {named by O cmmand\nM98 P100 L3; calls O100 and loops 3 times"},
	{name: 'M99', description: "Return from procedure call"},
	{name: 'M104', description: "Set target temperature 3d printer, continue before reached"},
	{name: 'M109', description: "Set target temperature 3d printer, wait until reached"},
	{name: 'GOTO', description: "Jump to another program line\nGOTO100; jumps to N100"},
	{name: 'IF',  description: "Conditional execution\nIF[#1]THEN G1 z5; goes down 5 as long as #1 is not 0\nIF[#2 EQ 0]GOTO100; goto N100 if #2 is not equal to 0"},
	{name: 'THEN', description: "What to to du if an IF condition was meet\n See IF."},
	{name: 'WHILE', description: "Loop until condition is false\nWHILE[#1]DO1\nG1...\nEND1"},
	{name: 'DO',  description: "Starts a while loop\nDO1 identifies the loop as 1, can be nested 1,2,3..."},
	{name: 'END', description: "Ends a WHILE loop\nEND1 ends a while stareted by DO1"},
	{name: '#n', description: "Paramater (variable) used in program\n#1-31 are local to procedure\n#32>global (reached from everywhere)"},
	{name: '#<...>', description: "Named parameter (variable) used in program\n#<...> are local to procedure.\n#<_..> are global"}
];
CWS.Interpreter.commands = CWS.Interpreter.prototype.commands;

// Creates an error object for the interpreter
CWS.ErrorInterpreter = function (line,message,data)
  {
    this.line = line;
    this.message = message;
    this.data = data;
  };
// Returns a string form of the error.
CWS.ErrorInterpreter.prototype.toString = function ()
  {
    return `ErrorIterpreter: ${message} on line: ${this.line}`;
  };