/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 */


// This file contains implementations for
// Parser
// GLine
// Command
// ErrorParser


// A Parser takes raw line data and parse into commands for the simulator
CWS.Parser = function ()
  {
    this.glines = [];
    this.commands = [];
    this.activeCommand = null;
    this.feedMode = null;
    CWS.GLine.prototype.parser = this;
    this.curNLineNumer = 0;    // A program can set N... as line number
    this.nLinesToLines = {};   // lookup table fo N... lines to program lines
    this.parametersUsed = [];
    this.procedures = {};
    this._iter = 0;
  }

CWS.Parser.prototype.pos = function()
  {
    return this._iter;
  }

CWS.Parser.prototype.setPos = function(pos)
  {
    this._iter = pos;
  }

CWS.Parser.prototype.firstCmdFor = function (lineNr)
  {
    return this.commands.findIndex(c=>c.line.lineNumber>=lineNr);
  }

// move internal pospntr noLines forward x noLines
CWS.Parser.prototype.jumpForward = function (noLines)
  {
    const lineNr = this.commands[this._iter].line.lineNumber;
    for (; this._iter < this.commands.length; this._iter++)
      if (this.commands[this._iter].line.lineNumber > lineNr)
        return this._iter;
  }

// Returns the next command from the list
CWS.Parser.prototype.getCommand = function()
  {
    if (this._iter < this.commands.length)
      return this.commands[this._iter++];
    return null;
  };
// Takes a line as a string and append a GLine to the array this.glines.
// If the line number is given the function will parse the line again.
// If the lineNumber is a null value the function will take as the last line
CWS.Parser.prototype.parseLine = function(line, errList)
  {
      var gline = new CWS.GLine(line, this.glines.length+1);
      gline.processLine(errList);
      this.glines.push(gline);
  };
// Takes a code, split the lines and parse
CWS.Parser.prototype.parseCode = function(code, errList)
  {
    code=code.split("\n");
    for (var i = 0; i < code.length; i++)
    {
      this.parseLine(code[i],errList);
    }
  };
// A GLine contains all the parsed data from a line.
// A GLine should be created as follows:
// var gl = new CWS.GLine(raw_line_string);
// gl.lineNumber = lineNumber
// gl.processLine();
CWS.GLine = function (line, lineNr)
  {
    this.coments = [];
    this.lineNumber = lineNr;
    this.nLineNumer = -1;
    this.rawLine = line;
    this.activeCommand = null;
  }
// A raw line is processed by removing comments, spitting the line into words and numbers
// and separating and sorting all the commands in a line
// Final result will be in Parser.commands in the right order to be processed by the simulator.
CWS.GLine.prototype.processLine = function(errList)
  {
    //var line = this.removeComment(this.rawLine);
    //line = this.splitLine(line);
    try {
      const line = this.parseLine(this.rawLine, this.parser);
      this.separeteCommands(line, this.parser);
    } catch (e) {
      console.log(e);
      errList.push(e);
    }
    this.activeCommand = this.parser.activeCommand;
  };
// Lowercase the line and remove comments
// CWS.GLine.prototype.removeComment = function(line)
//   {
//     // A comment can be anything inside left and right parenthesis or anything after a semicolon
//     var re = /(;.*)|(\([^)]*\))/g;
//     var m;

//     while ((m = re.exec(line)) !== null)
//     {
//       if (m.index === re.lastIndex)
//       {
//           re.lastIndex++;
//       }
//       this.coments.push(m[1]);
//     }
//     // Remove comments,line numbers and spaces
//     return line.toLowerCase().replace(re,"").replace(/\s/g,"").replace(/n\d*/,"");
//   };

// simple scanner -> parser
// heavily inspired by: https://linuxcnc.org/docs/html/gcode/overview.html
CWS.GLine.prototype.parseLine = function(line)
  {
    line = line.toLowerCase();
    const result = [];
    let i = 0, vlu = 0, prevI;

    // return next printable non WS char, leaving linepntr intact
    const peek = ()=>{
      let j = i;
      for (; j < line.length && line[j] <= ' '; ++j)
        ;
      if (i === j) j++;
      if (j === line.length) return '\0';
      return line[j];
    };

    // increment linepntr until next non WS char.
    // return true if more char to read on line.
    const eatWs = ()=>{
      for (; i < line.length && line[i] <= ' '; ++i)
        ;
      return i < line.length;
    };

    const number = ()=>{
      const nstr = [];
      if (eatWs()) {
        if (line[i] === '-' || line[i] === '+')
          nstr.push(line[i++]);

        for (;i < line.length; ++i) {
          if ((line[i] < '0' || line[i] > '9') && line[i]!=='.')
            break;
          nstr.push(line[i]);
        }
      }
      if (!nstr.length)
        this.throwError(`expected a number at col ${i}`);
      return +nstr.join('');
    };

    const parameter = (lookUpAssign)=> {
      if (line[i] !== '#')
        this.throwError(`Expected a parameter at col: ${i}`);
      const parameterParts = [line[i++]];
      if (line[i] === '<') { // allow <named variable> aka linux cnc
        parameterParts.push(line[i++]);
        for (; i < line.length && line[i] !== '>'; ++i) {
          if (line[i] === '<')
            this.throwError(`Unexpected '${line[i]}' at col: ${i}`);
          if (line[i] > ' ')
            parameterParts.push(line[i]);
        }
        if (i === line.length || line[i] !== '>')
          this.throwError(`Expected an '>' at col: ${i}`);
        parameterParts.push(line[i++])
      } else {
        // ordinary #1...999 parameters
        for (; i < line.length; ++i) {
          if (line[i] < '0' ||  line[i] > '9') break;
          parameterParts.push(line[i]);
        }
      }

      if (parameterParts.length < 2)
        this.throwError(`Invalid parameter at col: ${i}`);
      this.parser.parametersUsed.push(parameterParts.join(''));

      // ws before and after: ' = '
      if (lookUpAssign && (line[i]==='=' || peek()==='=') &&
          eatWs() && eatWs(++i))
        return ['=', parameterParts.join(''), expr()]; // assignment

      return parameterParts.join(''); // ordinary parameter access: x#1
    }

    const exprOperand = ()=>{
      if (!eatWs())
        this.throwError(`Unexpected end of line in expression at col: ${i}`);
      // left part of expression, required...
      switch (line[i]) {
      case '#': return parameter(false);
      case '[': return expr(); // subexpression // [[....]]
      default:  return number();
      }
    }

    // read operator and return its precedence, 0==highest
    const exprOperator = ()=>{
      switch (line[i]) {
      case '*':
        if (peek() === '*') { ++i; return ['**',0]; }
        i++; return ['*',1];
      case '/':
        i++; return ['/', 1];
      case 'm':
        if (i < line.length-2 && line.substring(i,i+2) === 'mod') {
           i+=2; return ['mod',1];
        }
        this.throwError(`Unexpected ${line.substring(i,i+2)} at col: ${i}`);
      case '+': case'-':
        return [line[i++], 2];
      default:
        // 2char long operator
        if (i < line.length-2) {
          let op = line.substring(i,i+2); i+=2;
          if (op === 'or')                   return [op, 4];
          const comparison = ['eq','ne','gt','ge','lt','le'];
          if (comparison.indexOf(op) !== -1) return [op, 3];
          i-=2;
        }

        // 3char long operator
        if (i < line.length-3) {
          op = line.substring(i,i+3); i+=3;
          if (op === 'mod')                     return ['mod',1];
          if (['and','xor'].indexOf(op) !== -1) return [op, 4];
          i-=3;
        }

        return null;
      }
    }

    // an expression Like: #1 / 2 or [#2 EQ [3 + #4]]
    // priority order (H->L): **, */MOD, +-, EQ|NE|GT|GE|LT|LE, AND|OR|XOR
    const expr = ()=> {
      const isBracket = line[i] === '[';
      if (isBracket) ++i;

      let left = exprOperand(),
          lastOp = [null,100]; // lowest priority

      while (i < line.length) {
        // optional, valid to end here, example: [#1] or #1=3
        if (!isBracket && line[i] == ' ') return left;
        if (!eatWs()) return left;
        if (line[i] === ']') {
          if (!isBracket)
            this.throwError(`Unexpected ']' at col: ${i}`);
          ++i; return left;
        }

        // operator part, build tree from operator precedence
        const op = exprOperator();
        if (op === null) break;

        const right = exprOperand();
        if (!Array.isArray(left) || op[1] < lastOp[1])
          left = [op[0], left, right];
        else
          left[2] = [op, left[2], right];
      }

      return left;
    }

    const parseGoto = ()=>{
      if (line.substring(i,i+4) !== 'goto')
        this.throwError(`Expected 'GOTO' at col: ${i}`);
      i+=4;
      return ['goto', roundCmdNr(number())];
    }

    const parseIf = ()=>{
      if (line.substring(i, i+2) !== 'if')
        this.throwError(`Expected 'IF' at col: ${i}`);
      const res = ['if'];
      i+=2;
      if (!eatWs())
        this.throwError(`Expected an expression at col: ${i}`);
      res.push(expr());
      if (!eatWs() || ['then', 'goto'].indexOf(line.substring(i,i+4)) === -1)
        this.throwError(`Expected 'THEN' or 'GOTO' at col: ${i}`);
      // handle end as spearate commands
      return res;
    }

    const parseThen = ()=>{
      if (line.substring(i, i+4) !== 'then')
        this.throwError(`Expected a 'then' at col: ${i}`);
      i+=4;
      return ['then'];
    }

    const parseWhile = ()=>{
      if (line.substring(i,i+5) !== 'while')
        this.throwError(`Expected 'WHILE' at col: ${i}`);
      const res = ['while'];
      i+=5;
      if (!eatWs())
        this.throwError(`Expected [expression] at col: ${i}`);
      res.push(expr());
      if (!eatWs() || line.substring(i, i+2) !== 'do')
        this.throwError(`Expected 'DO1 or DO2 ...' at col: ${i}`);
      i+=2;
      res.push(number());
      return res;
    }

    const parseEnd = ()=>{
      if (line.substring(i,i+3) !== 'end')
        this.throwError(`Expected 'END' at col: ${i}`);
      i+=3;
      return ['end', number()];
    }

    const roundCmdNr = (vlu)=>{
      return (vlu%1==0) ? Math.round(vlu) : Math.round(vlu*10);
    }

    //main loop to parse our line
    for (i=0, prevI = 0; i < line.length; prevI === i ? ++i : i) {
      prevI = i; // ensure loop advances even though i is increased in func.
      const c = line[i];
      switch (c) {
      case 'n':
        const num = number(++i);
        this.nLineNumer = num;
        this.parser.nLinesToLines[num] = this.lineNumber;
        result.push([c, num]);
        break;
      case 'g':
        if (line.substring(i,i+4) === 'goto') {
          result.push(parseGoto());
          break;
        }
        // intentional fallthrough
      case 'm': case 'p': case 'o':
        vlu = roundCmdNr(number(++i));
        result.push([c, vlu]);
        break;
      case '#': // parameter access, assignment or parameter expression
        result.push(parameter(true));
        break;
      case ' ': case '\t': case '\b': case '\r':
        break;
      case '$': // stange slicer specific variable, ignore rest of line
        for (; i < line.length; ++i)
          ;
        break;
      case ';': // comment rest of line.
        vlu = [];
        for (; i < line.length; ++i)
          vlu.push(line[i]);
        this.coments.push(vlu.join(''))
        return result;
      case '(': // comment, part of line
        vlu = [];
        for (i++; i < line.length && line[i] !== ')'; ++i)
          vlu.push(line[i]);
        this.coments.push(vlu.join(''));
        i++;
        break;
      case '[':
        this.throwError(`Unexpected expression at ${i}`);
      default:
        if (line.substring(i,i+2) === 'if') {
          result.push(parseIf());
        } else if (line.substring(i,i+5) === 'while') {
          result.push(parseWhile());
        } else if (line.substring(i,i+3) === 'end') {
          result.push(parseEnd());
        } else if (line.substring(i,i+4) === 'then') {
          result.push(parseThen());
        } else {
          eatWs(++i);
          result.push([c, expr()]);
        }
      }
    }
    return result;
  }

// Splits the line (string) into a vector containing pairs
// of characters and float numbers.
/*CWS.GLine.prototype.splitLine = function(line)
  {
    var re = /(?:([a-z])([+-]?\d*\.?\d*)|(?:(#)(\d{1,3}\s*=\s*(?:#\d{1,3}|\d+))))/g;
    var m;
    var result = [];
    while ((m = re.exec(line)) !== null)
    {
      if (m.index === re.lastIndex)
      {
          re.lastIndex++;
      }
      m[1]=m[1] !== undefined ? m[1] : m[3];
      m[2]=parseFloat(m[2] !== undefined ? m[2] : m[4]);
      if (m[1]=='g' || m[1]=='m')
      {
        if (m[2]%1==0)
          m[2]=Math.round(m[2]);
        else
          m[2]=Math.round(m[2]*10);
      }
      result.push([m[1],m[2]]);
    }
    // test for invalid parameter
    if (!line.startsWith("$") && /(?:[a-z]{2,}|[a-z][-+]*\d+\.*\d* \d)/.test(line))
        throw new CWS.ErrorParser(this.lineNumber,`incorrect parameters`,this.rawLine);
    return result;
  };*/
// A line may contain more than one command for the machine.
// Here the line will be divided into multiple commands for the machine.
// If the line contains more than one command, they will be sorted using the following method
  // 0.     Line number (Nxx)
  // 1.     Subroutine Oxxx
  // 2.     set feed rate mode (G93, G94 — inverse time or per minute).
  // 3.     IF, WHILE, M97, M98, M99
  // 4.     THEN
  // 5.     assign to an parameter
  // 6.     set feed rate (F).
  // 7.     set spindle speed (S).
  // 8.     set temperature (M104).
  // 9.     change tool (M6).
  // 10.    spindle on or off (M3, M4, M5).
  // 11.    coolant on or off (M7, M8, M9).  wait for temperature (M109)
  // 12.    enable or disable overrides (M48, M49). extrusion mode (M82, M83)
  // 13.    dwell (G4).
  // 14.    set active plane (G17, G18, G19).
  // 15.    set length units (G20, G21).
  // 16.    cutter radius compensation on or off (G40, G41, G42)
  // 17.    cutter length compensation on or off (G43, G49)
  // 18.    coordinate system selection (G54, G55, G56, G57, G58, G59, G59.1, G59.2, G59.3).
  // 19.    set path control mode (G61, G61.1, G64)
  // 20.    set distance mode (G90, G91).
  // 21.    set retract mode (G98, G99).
  // 22.    home (G28, G30) or
  // 23.    change coordinate system data (G10)
  // 24.    set axis offsets (G92, G92.1, G92.2).
  // 25.    G53.
  // 26.    perform motion (G0 to G3, G80 to G89)
  // 27.    X,Y,Z,R,I,J,K
  // 28.    GOTO, END
  // 29.    stop (M0, M1, M2, M30, M60).
  // 30.    Command not implemented
// Every command is an object of type Command
// If the G function takes parameters they will be inside the object Command
// A G code for motion (G0,G1,G2,G3) will only be added to the commands list if it has axis words
// If axis words appears alone a G function will be created with the current motion mode.
  // General functions and parameters
  // G0    X,Y,Z                   // G49
  // G1    X,Y,Z                   // G53
  // G2    X,Y,Z,R,I,J,K           // G54
  // G3    X,Y,Z,R,I,J,K           // G55
  // G4    P                       // G56
  // G10   L,P,X,Y,Z,R,I,J,Q       // G57
  // G17                           // G58
  // G18                           // G59
  // G19                           // G61
  // G20                           // G64
  // G21                           // G90
  // G28   X,Y,Z                   // G91
  // G30   X,Y,Z,P,H,S             // G92   X,Y,Z
  // G40                           // G93
  // G41   D                       // G94
  // G42   D                       // G98
  // G43   H                       // G99
CWS.GLine.prototype.multiCharCmds=['if','while','goto', 'then', 'end'];
CWS.GLine.prototype.separeteCommands = function(line)
  {
    // Get all the parameters
    const parametersList={},
          commandsUnsorted=[];
    for (var i = 0; i < line.length; i++)
    {
      elem=line[i];
      if ('gmfso='.indexOf(elem[0]) !== -1 ||
          this.multiCharCmds.indexOf(elem[0]) !== -1)
      {
        commandsUnsorted.push(elem);
      }
      else
      {
        parametersList[elem[0]]=elem[1];
      }
    };
    // Get all the commands
    ht=Array(31);
    for (var i = 0; i < commandsUnsorted.length; i++)
    {
      var elem=commandsUnsorted[i];
      var c = new CWS.Command();
      c.ctype = elem[0];
      c.number = elem[1];
      switch(elem[0])
      {
        case 'g':
          switch (elem[1])
          {
            case 93: case 94:
              this.parser.feedMode = elem[1];
              c.mgroup=5;
              pos=2;
              break;
            case 4:
              if (!this.checkParameter(parametersList,c,'p'))
                this.throwError("Wrong G4. Missing word P");
              if (c.param['p']<0)
                this.throwError("Wrong G4. P number must not be negative");
              c.mgroup=0;
              pos=13;
              break;
            case 17: case 18: case 19:
              c.mgroup=2;
              pos=14;
              break;
            case 20: case 21:
              c.mgroup=6;
              pos=15;
              break;
            case 41: case 42:
              if (!this.checkParameter(parametersList,c,'d'))
                this.throwError("Wrong G"+elem[1]+". Missing word D");
            case 40:
              c.mgroup=7;
              pos=16;
              break;
            case 43:
              if (!this.checkParameter(parametersList,c,'h'))
                this.throwError("Wrong G43. Missing word H");
            case 49: // fallthrough intentional
              c.mgroup=8;
              pos=17;
              break;
            case 54: case 55: case 56: case 57: case 58: case 59:
              c.mgroup=12;
              pos=18;
              break;
            case 61: case 64:
              c.mgroup=13;
              pos=19;
              break;
            case 90: case 91:
              c.mgroup=3;
              pos=20;
              break;
            case 98: case 99:
              c.mgroup=10;
              pos=21;
              break;
            case 30:
              this.checkParameter(parametersList,c,'p');
              this.checkParameter(parametersList,c,'h');
            case 28:
              this.checkParameter(parametersList,c,'x');
              this.checkParameter(parametersList,c,'y');
              this.checkParameter(parametersList,c,'z');
              c.mgroup=0;
              pos=22;
              break;
            case 10:
              if (this.checkParameter(parametersList,c,'l'))
              {
                if (!this.checkParameter(parametersList,c,'p'))
                  this.throwError("Wrong G10. Missing word P");
                this.checkParameter(parametersList,c,'x');
                this.checkParameter(parametersList,c,'y');
                this.checkParameter(parametersList,c,'z');
                this.checkParameter(parametersList,c,'r');
                if (c.param['l']==1 || c.param['l']==10 || c.param['l']==11)
                {
                  this.checkParameter(parametersList,c,'i');
                  this.checkParameter(parametersList,c,'j');
                  this.checkParameter(parametersList,c,'q');
                }
              }
              else
                this.throwError("Wrong G10. Missing word L");
              c.mgroup=0;
              pos=23;
              break;
            case 92:
              var temp = false;
              temp = this.checkParameter(parametersList,c,'x')||temp;
              temp = this.checkParameter(parametersList,c,'y')||temp;
              temp = this.checkParameter(parametersList,c,'z')||temp;
              temp = this.checkParameter(parametersList,c,'e')||temp;
              if (temp==false)
                this.throwError("Wrong G92. All axis words are omitted");
              c.mgroup=0;
              pos=24;
              break;
            case 53:
              c.mgroup=0;
              pos=25;
              break;
            case 0: case 1: case 2: case 3:
              this.parser.activeCommand=c.number;
              c.mgroup=1;
              pos=26;
              break;
            default:
              c.number=9999;
              param=elem;
              pos=30;
              break;
          }
          break;
        // Miscellaneous function
        case 'm':
          switch (elem[1])
          {
            case 104:
              pos=8;
              break;
            case 6:
              c.mgroup=6;
              pos=9;
              break;
            case 3: case 4: case 5:
              c.mgroup=7;
              pos=10;
              break;
            case 7: case 8: case 9: case 109:
              c.mgroup=8;
              pos=11;
              break;
            case 48: case 49: case 82: case 83:
              c.mgroup=9;
              pos=12;
              break;
            case 0: case 1: case 2: case 30: case 60:
              c.mgroup=4;
              pos=29;
              break;
            case 97:
              if (!this.checkParameter(parametersList,c,'n'))
                this.throwError("Wrong G97. Missing word N");
              this.checkParameter(parametersList,c,'l')
              this.parser.activeCommand = null;
              c.mgroup=0;
              pos=3;
              break;
            case 98:
              if (!this.checkParameter(parametersList,c,'p'))
                this.throwError("Wrong G98. Missing word P");
              this.checkParameter(parametersList,c,'l')
            case 99: // fallthrough intentional
              this.parser.activeCommand = null;
              c.mgroup=0;
              pos=3;
              break;
            default:
              c.number=9999;
              param=elem;
              pos=30;
              break;
          }
          break;
        // Feed rate
        case 'f':
          c.number=0;
          c.param['f']=elem[1];
          pos=6;
          break;
        // Spindle speed or temperature
        case 's':
          c.number=0;
          c.param['s']=elem[1];
          pos=7;
          break;
        // define procedure
        case 'o':
          this.parser.procedures[c.number]=this.parser.commands.length+1;
          this.parser.activeCommand=null;
          pos=1;
          break;
        case'n':
          pos=0;
          break;
        // Parameter assignment
        case '=':
          c.param['vlu'] = elem[2];
          this.parser.activeCommand=null;
          pos=5;
          break;
        case 'goto':
          c.param['toLine'] = elem[1];
          pos=28;
          break;
        case 'while':
          c.param.cond = elem[1];
          c.param.doNr = elem[2];
          pos=3;
          break;
        case 'end':
          pos=28;
          break;
        case 'if':
          c.param.cond = elem[1];
          pos=3; // must have higher priority than assign and then
          break;
        case 'then':
          c.param.cond = elem[1];
          pos=4;
          break;
      }
      ht[pos]=c;
    }
    // Find axis words and generate a motion G code
    if (Object.keys(parametersList).length && this.parser.activeCommand!==null)
    {
      var temp = false;
      var temp2 = true;
      var c1 = new CWS.Command();
      temp = this.checkParameter(parametersList,c1,'x')||temp;
      temp = this.checkParameter(parametersList,c1,'y')||temp;
      temp = this.checkParameter(parametersList,c1,'z')||temp;
      temp = this.checkParameter(parametersList,c1,'e')||temp;
      temp = this.checkParameter(parametersList,c1,'f')||temp;
      temp = this.checkParameter(parametersList,c1,'a')||temp;
      if (this.parser.activeCommand==2 || this.parser.activeCommand==3)
      {
        temp2 = false;
        temp2 = this.checkParameter(parametersList,c1,'r')||temp2;
        temp2 = this.checkParameter(parametersList,c1,'i')||temp2;
        temp2 = this.checkParameter(parametersList,c1,'j')||temp2;
        temp2 = this.checkParameter(parametersList,c1,'k')||temp2;
      }
      if (temp==true && temp2==true)
      {
        c1.ctype = 'g';
        c1.mgroup = 1;
        c1.number = this.parser.activeCommand;
        // If G93 is active every line with G1,G2,G3 should have the F word
        if (this.parser.feedMode==93 && c1.number!=0 && ht[1]===undefined)
          this.throwError("G93 is active but F word is missing");
        ht[22]=c1;
      }
      else if (c)
      {
        ht[22]=undefined;
        this.throwError(`G${c.number} incorrect parameters`);
      }
    }
    // Fill the commands vector with the commands already sorted
    for (var i = 0; i < ht.length; i++)
    {
      if (ht[i]!==undefined)
      {
        ht[i].line = this;
        this.parser.commands.push(ht[i]);
      }
    }
  };
// Check whether the parameter exists.
// If it exists then it will be added to the command and deleted from the
// parameters list. Otherwise it returns false
CWS.GLine.prototype.checkParameter = function(parametersList,c,parm)
  {
    if (parm in parametersList)
    {
      if (/x|y|z/.test(parm))
        c.param.xyz[parm]=parametersList[parm];
      else if (/i|j|k/.test(parm))
        c.param.ijk[parm]=parametersList[parm];
      else
        c.param[parm]=parametersList[parm];
      delete parametersList[parm];
      return true;
    }
    else
      return false;
  };
CWS.GLine.prototype.throwError = function(msg)
  {
    throw new CWS.ErrorParser(this.lineNumber, msg, this.rawLine);
  }

// A Command can be any function that changes the state of the machine
// To be more specific a command is the smallest instruction that will be passed to the simulator.
// It contains the type and other data like parameters.
CWS.Command = function ()
  {
    // g,m,f,s
    this.ctype = null;
    // Modal groups
    this.mgroup = null;
    // g or m number
    this.number = null;
    // Parameters
    this.param = {ijk:{},xyz:{}};
    // A pointer to the line
    this.line = null;
  }
// Creates an error object for the parser
CWS.ErrorParser = function (line, message, data)
  {
    this.line = line;
    this.message = message;
    this.data = data;
  };
// Returns a string form of the error.
CWS.ErrorParser.prototype.toString = function ()
  {
    return `ErrorParser: ${message} on line: ${this.line}`;
  };