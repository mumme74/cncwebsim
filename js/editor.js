"use strict"
/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 */

const langTools = ace.require('ace/ext/language_tools');
const oop = require("ace/lib/oop");
const event = require("ace/lib/event");
const Range = require("ace/range").Range;
const Tooltip = require("ace/tooltip").Tooltip;
const TextHighlightRules = require("ace/mode/text_highlight_rules").TextHighlightRules;


CWS.CodeEditor = function ()
	{
		var date=new Date();

		this.editor = new ace.edit("editor");
		this.editor.$blockScrolling = Infinity;
		this.editor.setTheme("ace/theme/monokai");
		const session = this.editor.getSession();
		session.setMode("custom/gcode");
	    session.setUseWrapMode(true);
	    session.setTabSize(2);
	    this.editor.setFontSize(16);
	    this.unsaved = false;
		this.codeChangedSubscribers = [];
		this.tokenTooltip = new TokenTooltip(this);
		this.controller = null; // set by controller

	    var context = this;
	    this.editor.on("change", function(e)
		{
			if (e.isLarge)
				return;
			context.codeChanged(e);
		});

		this.editor.on("guttermousedown", (e) => {
			const target = e.domEvent.target;
			if (!target.classList.contains("ace_gutter-cell"))
				return;

			const row = e.getDocumentPosition().row;
			const breakpoints = e.editor.session.getBreakpoints(row, 0);
			if(breakpoints[row] === undefined)
				e.editor.session.setBreakpoint(row);
			else
				e.editor.session.clearBreakpoint(row);
			e.stop();
		});

		$(document).ready(()=>{
			this.setupCompleter();
		});
	};


CWS.CodeEditor.prototype.constructor = CWS.CodeEditor;

CWS.CodeEditor.prototype.setupCompleter = function ()
	{
		const completer = {
			getCompletions: function(editor, session, pos, prefix, callback) {

				callback(null, CWS.Interpreter.commands.map((cmd)=>{
					return {
							caption:cmd.name,
							value:cmd.name,
							meta:cmd.description
						};
				}));
			},
			identifierRegexps:[/#/,/#\d+/, /#<[\b\d_ ]+>/]
		};

		langTools.setCompleters([completer]); //, langTools.textCompleter]);

		this.editor.setOptions({
			//enableBasicAutocompletion: true,
			enableSnippets: true,
			enableLiveAutocompletion: true
		});
	}

CWS.CodeEditor.prototype.codeChanged = function (ev)
	{
		const code = this.getCode();
		const breakPnts = Object.keys(this.editor.getSession().getBreakpoints());
		for (const cb of this.codeChangedSubscribers)
			cb(code, breakPnts, ev);
	};

CWS.CodeEditor.prototype.subscribeToCodeChanged = function (func)
	{
		this.codeChangedSubscribers.push(func);
	};

CWS.CodeEditor.prototype.getCode = function()
	{
		return this.editor.getValue();
	};

CWS.CodeEditor.prototype.setCode = function(code)
	{
		this.editor.setValue(code,-1);
	};

CWS.CodeEditor.prototype.readOnly = function(ro)
	{
		this.editor.setReadOnly(ro);
	};

CWS.CodeEditor.prototype.setCurrentLine = function(lineNr, state)
	{
		const markers = this.editor.getSession().getMarkers();
		for (const [key, obj] of Object.entries(markers))
			if (obj.clazz==="ace_step")
				this.editor.getSession().removeMarker(key);

		if (lineNr > -1) {
			this.editor.getSession().highlightLines(lineNr);
			if (state === 'halted')
				this.editor.scrollToLine(lineNr)
		}
	}


class TokenTooltip extends Tooltip {
    constructor(editor) {
        if (editor.tokenTooltip)
            return;
        super(editor.editor.container);
        editor.editor.tokenTooltip = this;
        this.editor = editor;

        this.update = this.update.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseOut = this.onMouseOut.bind(this);
        event.addListener(editor.editor.renderer.scroller, "mousemove", this.onMouseMove);
        event.addListener(editor.editor.renderer.content, "mouseout", this.onMouseOut);
    }
    token = {};

    range = new Range();

    update() {
        this.$timer = null;

        var r = this.editor.editor.renderer;
        if (this.lastT - (r.timeStamp || 0) > 1000) {
            r.rect = null;
            r.timeStamp = this.lastT;
            this.maxHeight = window.innerHeight;
            this.maxWidth = window.innerWidth;
        }

        var canvasPos = r.rect || (r.rect = r.scroller.getBoundingClientRect());
        var offset = (this.x + r.scrollLeft - canvasPos.left - r.$padding) / r.characterWidth;
        var row = Math.floor((this.y + r.scrollTop - canvasPos.top) / r.lineHeight);
        var col = Math.round(offset);

        var screenPos = {row: row, column: col, side: offset - col > 0 ? 1 : -1};
        var session = this.editor.editor.session;
        var docPos = session.screenToDocumentPosition(screenPos.row, screenPos.column);
        var token = session.getTokenAt(docPos.row, docPos.column);
		var tokenText = "";

        if (!token && !session.getLine(docPos.row)) {
            token = {
                type: "",
                value: "",
                state: session.bgTokenizer.getState(0)
            };
        }
        if (!token) {
            session.removeMarker(this.marker);
            this.hide();
            return;
        }

		const onRecvVlu = (name, value)=>{
			if (name === token.value) {
				tokenText = `${token.value}: ${value}`;

				this.setText(tokenText);
				this.width = this.getWidth();
				this.height = this.getHeight();
				this.tokenText = tokenText;
			}
		}

		const variableHandler = (caption)=>{
			const state = this.editor.controller.motion.state;
			if (state === "halted") {
				this.editor.controller.motion.getVariableVlu(
					token.value, onRecvVlu)
			} else  {
				tokenText += `${caption}\n`;
				const entry = CWS.Interpreter.commands.find(
					e=>e.name.startsWith('#'));
				if (entry) tokenText += entry.description;
			}
		}

		switch (token.type) {
		case 'support.function': case 'keyword.control': {
			const tok = token.value.replace(/(^[GM])0?([0-9]+$)/i, "$1$2")
							.toUpperCase();
			const entry = CWS.Interpreter.commands.find(e=>e.name===tok);
			if (entry) tokenText += entry.description;
		} break;
		case 'variable.other': {
			variableHandler('Local parameter, only accessible in this procedure');
		} break;
		case 'variable.parameter': {
			variableHandler("Global variable, accessible everywhere\n")
		} break;
		case 'support.constant':
			tokenText += "Virtual linenr, used as a label";
		  break;
		case 'support.type':
			tokenText += "Start a new procedure";
		  break;
		default:
			this.hide();
		}

        if (this.tokenText != tokenText && tokenText) {
            this.setText(tokenText);
            this.width = this.getWidth();
            this.height = this.getHeight();
            this.tokenText = tokenText;

        	this.show(null, this.x, this.y);
        }

        this.token = token;
        session.removeMarker(this.marker);
        this.range = new Range(docPos.row, token.start, docPos.row, token.start + token.value.length);
        this.marker = session.addMarker(this.range, "ace_bracket", "text");
    };

    onMouseMove(e) {
        this.x = e.clientX;
        this.y = e.clientY;
        if (this.isOpen) {
            this.lastT = e.timeStamp;
            this.setPosition(this.x, this.y);
        }
        if (!this.$timer)
            this.$timer = setTimeout(this.update, 1000);
    };

    onMouseOut(e) {
        if (e && e.currentTarget.contains(e.relatedTarget))
            return;
        this.hide();
        this.editor.editor.session.removeMarker(this.marker);
        this.$timer = clearTimeout(this.$timer);
    };

    setPosition(x, y) {
        if (x + 10 + this.width > this.maxWidth)
            x = window.innerWidth - this.width - 10;
        if (y > window.innerHeight * 0.75 || y + 20 + this.height > this.maxHeight)
            y = y - this.height - 30;

        Tooltip.prototype.setPosition.call(this, x + 10, y + 20);
    };

    destroy() {
        this.onMouseOut();
        event.removeListener(this.editor.renderer.scroller, "mousemove", this.onMouseMove);
        event.removeListener(this.editor.renderer.content, "mouseout", this.onMouseOut);
        delete this.editor.tokenTooltip;
    };

}

// built in highlighter was not correct
function CustomGcodeHighlightRules() {
	var keywordsControl = (
		"IF|DO|WHILE|END|GOTO|THEN"
		);

	var builtinConstants = (
		"PI"
		);
	var keywordOperators = ("EQ|LT|GT|NE|GE|LE|OR|XOR|MOD");

	var builtinFunctions = (
		"ATAN|ABS|ACOS|ASIN|SIN|COS|EXP|FIX|FUP|ROUND|LN|TAN"
		);
	var keywordMapper = this.createKeywordMapper({
		"support.function": builtinFunctions,
		"keyword.control": keywordsControl,
		"constant.language": builtinConstants,
	    "keyword.operator": keywordOperators
	}, "identifier", true);

	this.$rules = {
		"start" : [ {
			token : "comment.block",
			regex : "\\(.*\\)"
		}, {
			token : "comment.line",
			regex : "(;.*)"
		},{
			token : "support.constant", // a label kind of thing
			regex : "([N])([0-9]+)",
            caseInsensitive: true
		}, {
			token : "support.function",   // commands
			regex : "([G])([0-9]+\\.?[0-9]?)",
            caseInsensitive: true
		}, {
			token : "support.class",     // machine commands
			regex : "([M])([0-9]+\\.?[0-9]?)",
            caseInsensitive: true
		}, {
			token : "support.type",
			regex : "(O[0-9]+)",
			caseInsensitive: true
		}, {
			token : "constant.numeric", // float
			regex : "([-+]?([0-9]*\\.?[0-9]+\\.?))|(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)"
		}, {
			token : keywordMapper,
			regex : "([A-Z]+)",
            caseInsensitive: true
		}, {
			token : "paren.lparen",
			regex : "([\\[])"
		}, {
			token : "paren.rparen",
			regex : "([\\]])"
		}, {
			token : "variable.other", // local variable
			regex : "(#(?:[0-2][0-9]?|3[0-1]))"
		}, {
			token : "variable.parameter", // global variable
			regex : "(#(?:[3-9][2-9]|\d{3}))"
		}, {
			token : "variable.other", // local variable
			regex : "(#<[A-Z][A-Z_]*>)",
            caseInsensitive: true
		}, {
			token : "variable.parameter", // global variable
			regex : "(#<_[A-Z_]*>)",
            caseInsensitive: true
		}, {
			token : "keyword.operator",
			regex : "[-+=\/*]"
		}, {
			token : "text",
			regex : "\\s+"
		} ]
	};
}

oop.inherits(CustomGcodeHighlightRules, TextHighlightRules);


define("custom/gcode",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/gcode_highlight_rules","ace/range"], function(require, exports, module) {
    "use strict";

    var oop = require("ace/lib/oop");
    var TextMode = require("ace/mode/text").Mode;

    var Mode = function() {
        this.HighlightRules = CustomGcodeHighlightRules;
    };
    oop.inherits(Mode, TextMode);

    (function() {
        this.$id = "custom/gcode";
    }).call(Mode.prototype);

    exports.Mode = Mode;

});
