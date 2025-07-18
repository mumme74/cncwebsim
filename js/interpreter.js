/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 */

CWS.Interpreter = function (machine)
	{
		// Mill - Mill, Lathe - Lathe, 3D Printer - Printer
		this.machineType = machine.mtype;
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

		// Coordinate system is P0
		this.settings.coord_system=this.coordinateSystemTable[0];

		this.N_ARC_CORRECTION = 0;

		this.invertRadius = 1;
		if (this.machineType=="Lathe")
		{
			this.invertRadius = -1;
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
	}

CWS.Interpreter.prototype.runCommand = function (prgCmd)
	{
		if (!this.stopRunning)
			return this[prgCmd.ctype+prgCmd.number](prgCmd);
	};

CWS.Interpreter.prototype.getCommand = function ()
	{
		return this.outputCommands.shift();
	};
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
		// body...
	};
// If a M code is not implemented
CWS.Interpreter.prototype.m9999  = function (prgCmd)
	{
		// body...
	};

CWS.Interpreter.prototype.coordinatesToAbsolute  = function (prgCmd)
	{
		const cmd = {...prgCmd}; // take a copy
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
	if (this.modal.feed_rate_mode==93)
		this.settings.feed_rate93=prgCmd.param['f'];
	else
		this.settings.feed_rate=prgCmd.param['f'];
	return true;
	};
// For 3D printers S word can be time,temperature,voltage etc.
// For the other machines S is the spindle speed and it cannot be negative
CWS.Interpreter.prototype.s0  = function (prgCmd)
	{
	if (this.machineType!='3D Printer')
	{
		if (prgCmd.param.s<0)
			throw new CWS.ErrorParser(prgCmd.line.lineNumber,"Wrong S number. S cannot be a negative number",prgCmd.line.rawLine);
		else
			this.spindle_speed=prgCmd.param.s;
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

CWS.Interpreter.prototype._makeOutCmd = function(prgCmd, ctype, x1, y1, z1)
	{
		const newCmd = {
			x0:this.position.x, x1,
			y0:this.position.y, y1,
			z0:this.position.z, z1,
			ctype, cmd: prgCmd
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


CWS.Interpreter.prototype._arc  = function (prgCmd, ctype)
	{
	if (this.move3dPrinter(prgCmd))
		return;

	const cmd = this.coordinatesToAbsolute(prgCmd);
	var x = cmd.param.xyz[this.axisXYZ_0]-this.position[this.axisXYZ_0];
	var y = cmd.param.xyz[this.axisXYZ_1]-this.position[this.axisXYZ_1];
	var z = cmd.param.xyz[this.axisXYZ_linear];
	var i,j;

	if (cmd.param.r !== undefined)
	{
		cmd.param.r *= this.modal.units;
		var d2=x*x+y*y;
		var h_x2_div_d = 4.0*cmd.param.r*cmd.param.r-x*x-y*y;
		if (h_x2_div_d < 0)
			throw new CWS.ErrorParser(cmd.line.lineNumber,"Wrong radius",cmd.line.rawLine);
		h_x2_div_d = Math.sqrt(h_x2_div_d)/Math.sqrt(d2)*this.invertRadius;
		if (ctype === 3) h_x2_div_d = -h_x2_div_d;
		if (cmd.param.r < 0)
		{
            h_x2_div_d = -h_x2_div_d;
            cmd.param.r = -cmd.param.r;
        }
        cmd.param.ijk[this.axisIJK_0] = 0.5*(x+(y*h_x2_div_d));
        cmd.param.ijk[this.axisIJK_1] = 0.5*(y-(x*h_x2_div_d));
	}

	var center_axis0 = this.position[this.axisXYZ_0] + cmd.param.ijk[this.axisIJK_0];
  	var center_axis1 = this.position[this.axisXYZ_1] + cmd.param.ijk[this.axisIJK_1];
  	var r_axis0 = -cmd.param.ijk[this.axisIJK_0];  // Radius vector from center to current location
  	var r_axis1 = -cmd.param.ijk[this.axisIJK_1];
  	var rt_axis0 = cmd.param.xyz[this.axisXYZ_0] - center_axis0;
  	var rt_axis1 = cmd.param.xyz[this.axisXYZ_1] - center_axis1;

  	arc_tolerance=0.0002 // mm

  	angular_travel = Math.atan2(r_axis0*rt_axis1-r_axis1*rt_axis0, r_axis0*rt_axis0+r_axis1*rt_axis1);
  	if ((ctype === 2 && angular_travel >= 0.0) ||
        (ctype === 3 && angular_travel <= 0.0))
		angular_travel = -angular_travel; // rotate in the correct direction

  	segments = Math.floor(Math.abs(0.5*angular_travel*cmd.param.r)/
                          Math.sqrt(arc_tolerance*(2*cmd.param.r-arc_tolerance)) );
	theta_per_segment = angular_travel/segments;
    linear_per_segment = (cmd.param.xyz[this.axisXYZ_linear] - this.position[this.axisXYZ_linear])/segments;

    cos_T = 2.0 - theta_per_segment*theta_per_segment;
    sin_T = theta_per_segment*0.16666667*(cos_T + 4.0);
    cos_T *= 0.5;

    var sin_Ti;
    var cos_Ti;
    var r_axisi;
    var i;
    var count = 0;

    for (i = 1; i<segments; i++)
    { // Increment (segments-1).

      if (count < this.N_ARC_CORRECTION)
      {
        // Apply vector rotation matrix. ~40 usec
        r_axisi = r_axis0*sin_T + r_axis1*cos_T;
        r_axis0 = r_axis0*cos_T - r_axis1*sin_T;
        r_axis1 = r_axisi;
        count++;
      }
      else
      {
        // Arc correction to radius vector. Computed only every N_ARC_CORRECTION increments. ~375 usec
        // Compute exact location by applying transformation matrix from initial radius vector(=-offset).
        cos_Ti = Math.cos(i*theta_per_segment);
        sin_Ti = Math.sin(i*theta_per_segment);
        r_axis0 = -cmd.param.ijk[this.axisIJK_0]*cos_Ti + cmd.param.ijk[this.axisIJK_1]*sin_Ti;
        r_axis1 = -cmd.param.ijk[this.axisIJK_0]*sin_Ti - cmd.param.ijk[this.axisIJK_1]*cos_Ti;
        count = 0;
      }

      var pos={};
      pos[this.axisXYZ_0]=center_axis0+r_axis0;
      pos[this.axisXYZ_1]=center_axis1+r_axis1;
      pos[this.axisXYZ_linear]=linear_per_segment*i+z;

	  const outCmd = this._makeOutCmd(cmd, ctype, pos.x, pos.y, pos.z);
	  this.outputCommands.push(outCmd);
    }

	const outCmd = this._makeOutCmd(
		cmd, ctype, cmd.param.xyz.x, cmd.param.xyz.y, cmd.param.xyz.z);

	this.outputCommands.push(outCmd);

  	this.position.x=cmd.param.xyz.x;
  	this.position.y=cmd.param.xyz.y;
	this.position.z=cmd.param.xyz.z;
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
	// body...
	};

CWS.Interpreter.prototype.g10 = function (prgCmd)
	{
	var l=Math.round(prgCmd.param['l']);
	delete prgCmd.param['l'];
	var p=Math.round(prgCmd.param['p']);
	delete prgCmd.param['p'];
	// Set Tool Table
	if (l==1)
	{
		if (this.toolTable[p] === undefined)
			throw new CWS.ErrorParser(prgCmd.line.lineNumber,"Wrong G10 L1. Invalid P word",prgCmd.line.rawLine);
		for (var k in prgCmd.param)
			this.toolTable[p][k]=prgCmd.param[k];
	}
	else if(l==2)
	{
		if (p<0 || p>6)
			throw new CWS.ErrorParser(prgCmd.line.lineNumber,"Wrong G10 L2. Invalid P word",prgCmd.line.rawLine);
		for (var k in prgCmd.param)
			this.coordinateSystemTable[p][k]=prgCmd.param[k];
	}
	// L10,L11 Not implemented
	};

CWS.Interpreter.prototype.g17 = function (prgCmd)
	{
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
	this.modal.units = 25.4;
	};

CWS.Interpreter.prototype.g21 = function (prgCmd)
	{
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
	// body...
	};

CWS.Interpreter.prototype.g40 = function (prgCmd)
	{
	// body...
	this.modal.cutter_comp=40;
	};

CWS.Interpreter.prototype.g41 = function (prgCmd)
	{
	// body...
	this.modal.cutter_comp=41;
	};

CWS.Interpreter.prototype.g42 = function (prgCmd)
	{
	// body...
	this.modal.cutter_comp=42;
	};

CWS.Interpreter.prototype.g43 = function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.g49 = function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.g53 = function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.g54 = function (prgCmd)
	{
	// body...
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorParser(this.lineNumber,"Wrong G54. Cutter compensation is on",this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[1];
	};

CWS.Interpreter.prototype.g55 = function (prgCmd)
	{
	// body...
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorParser(this.lineNumber,"Wrong G55. Cutter compensation is on",this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[2];
	};

CWS.Interpreter.prototype.g56 = function (prgCmd)
	{
	// body...
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorParser(this.lineNumber,"Wrong G56. Cutter compensation is on",this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[3];
	};

CWS.Interpreter.prototype.g57 = function (prgCmd)
	{
	// body...
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorParser(this.lineNumber,"Wrong G57. Cutter compensation is on",this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[4];
	};

CWS.Interpreter.prototype.g58 = function (prgCmd)
	{
	// body...
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorParser(this.lineNumber,"Wrong G58. Cutter compensation is on",this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[5];
	};

CWS.Interpreter.prototype.g59 = function (prgCmd)
	{
	// body...
	if (this.modal.cutter_comp!=40)
		throw new CWS.ErrorParser(this.lineNumber,"Wrong G59. Cutter compensation is on",this.rawLine);
	this.settings.coord_system=this.coordinateSystemTable[6];
	};

CWS.Interpreter.prototype.g61 = function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.g64 = function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.g90 = function (prgCmd)
	{
	// body...
	this.modal.distance=90;
	};

CWS.Interpreter.prototype.g91 = function (prgCmd)
	{
	this.modal.distance=91;
	// body...
	};

CWS.Interpreter.prototype.g92 = function (prgCmd)
	{
	for (var k in prgCmd.param.xyz)
		this.settings.coord_offset[k]=prgCmd.param.xyz[k]*this.modal.units;
	};

CWS.Interpreter.prototype.g93 = function (prgCmd)
	{
	// body...
	this.modal.feed_rate_mode=93;
	};

CWS.Interpreter.prototype.g94 = function (prgCmd)
	{
	// body...
	this.modal.feed_rate_mode=94;
	this.settings.feed_rate=null;
	};

CWS.Interpreter.prototype.g98 = function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.g99 = function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m0	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m1	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m2	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m3	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m4	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m5	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m6	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m7	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m8	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m9	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m30	= function (prgCmd)
	{
	// body...
	this.stopRunning = true;
	};

CWS.Interpreter.prototype.m48	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m49	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m60	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m82	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m83	= function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m104 = function (prgCmd)
	{
	// body...
	};

CWS.Interpreter.prototype.m109 = function (prgCmd)
	{
	// body...
	}

// Creates an error object for the parser
CWS.ErrorParser = function (line,message,data)
  {
    this.line = line;
    this.message = message;
    this.data = data;
  };
// Returns a string form of the error.
CWS.ErrorParser.prototype.toString = function ()
  {
    return "Error on line: "+this.line;
  };