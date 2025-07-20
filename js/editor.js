/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 */
const langTools = ace.require('ace/ext/language_tools');

CWS.CodeEditor = function ()
	{
		var date=new Date();

		this.editor = new ace.edit("editor");
		this.editor.$blockScrolling = Infinity;
		this.editor.setTheme("ace/theme/monokai");
		const session = this.editor.getSession();
	    session.setMode("ace/mode/gcode");
	    session.setUseWrapMode(true);
	    session.setTabSize(2);
	    this.editor.setFontSize(16);
	    this.unsaved = false;
		this.codeChangedSubscribers = [];

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
			getDocTooltip: function(item) {
				if (item.exactMatch) {
					return item.meta;
				} else if (item.caption.startsWith('#'))
				{
					console.log(item)
				}
				return null; // No tooltip for other items
			},
			identifierRegexps:[/#/,/#\d+/, /#<[\b\d_ ]+>/]
		};

		langTools.setCompleters([completer, langTools.textCompleter]);

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