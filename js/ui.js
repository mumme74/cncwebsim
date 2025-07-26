/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 * @author Fredrik Johansson / github.com/mumme74
 */


CWS.UI = function (controller)
    {
        this.controller = controller;
        window.addEventListener('resize',this.resize.bind(this));

        var topMenu = $("#topMenu");
        $("#topMenu>nav > ul > li").each(function(i){$(this)
            .mouseenter(function(){topMenu.css('height','90px');})
            .mouseleave(function(){topMenu.css('height','45px');})
        });
        topMenu.click(this.handleTopMenu.bind(this));

        this.elementEditor = $(document.getElementById("editor"));
        this.elementTopMenu = $(document.getElementById("topMenu"));
        this.elementCanvasContainer = $(document.getElementById("canvasContainer"));
        this.elementBottomMenu = $(document.getElementById("bottomMenu"));
        this.elementBody = $(document.body);
        this.resize();
        $("#saveIcon").css('color', 'green').click(function (ev)
        {
            controller.save(true);
        });
        this.settingsButton("#autoRunIcon", "autoRun", function ()
        {
            controller.storage.autoRun=!controller.storage.autoRun;
            if (controller.storage.autoRun)
                controller.interpreterRun(true);
        });
        $("#runIcon").click(function (ev)
        {
            controller.interpreterRun(true);
        });
        this.settingsButton("#run2DIcon", "run2D", function (ev)
        {
            controller.storage.run2D=!controller.storage.run2D;
            controller.update2D();
        });
        this.settingsButton("#run3DIcon", "run3D", function (ev)
        {
            controller.storage.run3D=!controller.storage.run3D;
            controller.update3D();
        });
        this.settingsButton("#wireframeIcon", "runWireframe", function (ev)
        {
            controller.storage.runWireframe=!controller.storage.runWireframe;
        });
        $("#runAnimationIcon").click(function (ev)
        {
            controller.runAnimation();
        });
        this.settingsButton("#toggleGrid", "gridHelper", ()=>{
            controller.storage.gridHelper=!controller.storage.gridHelper;
        });

        // special debug buttons
        $("#stopIcon").click(function(){
            controller.interpreterStop();
        });
        $("#continueIcon").click(function () {
            controller.interpreterContinue();
        });
        $("#stepOverIcon").click(function () {
            controller.interpreterStepOut();
        });
        $("#nextIcon").click(function () {
            controller.interpreterNext();
        });
    }

CWS.UI.prototype.constructor = CWS.UI;

CWS.UI.prototype.handleTopMenu = function(ev)
    {
        const title = ev.target.title
        switch (title)
        {
        case "New Project":
            var d = new CWS.DialogBox(title);
            d.newProject(this.controller);
            break;
        case "Open Project":
            var d = new CWS.DialogBox(title);
            d.openProject(this.controller);
            break;
        case "Open Machine":
            var d = new CWS.DialogBox(title);
            d.openMachine(this.controller);
            break;
        case "Delete Project":
            var d = new CWS.DialogBox(title);
            d.deleteProject(this.controller);
            break;
        case "Demo File":
            var d = new CWS.DialogBox(title);
            d.showDemos(this.controller);
            break;
        case "Workpiece dimensions":
            var d = new CWS.DialogBox(title);
            d.workpieceDimensions(this.controller);
            break;
        case "Export Project":
            this.controller.exportProject();
            break
        case "Export STL":
            this.controller.exportToOBJ();
            break;
        case "Import File":
            var d = new CWS.DialogBox(title);
            d.importFile(this.controller);
            break;
        case "Tool":
            var d = new CWS.DialogBox(title);
            d.tool(this.controller);
            break;
        case "Documentation":
            var d = new CWS.DialogBox(title);
            d.documentationGcode(this.controller);
            break;
        case "License":
            const a = document.createElement("a");
            a.setAttribute("href", "https://opensource.org/license/mit");
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            break;
        case "About":
            var d = new CWS.DialogBox(title);
            d.about();
        default:
            break;
        }
    }

CWS.UI.prototype.resize = function()
    {
        var width = this.elementBody.innerWidth();
        var height = this.elementBody.innerHeight();

        var editorWidth;
        if (this.elementEditor.css('display')==='none')
            editorWidth = 0;
        else
            editorWidth = this.elementEditor.innerWidth();

        this.elementTopMenu.innerWidth(width-editorWidth);
        this.elementCanvasContainer.innerWidth(width-editorWidth);
        this.controller.renderer.setSize(width-editorWidth,height);
        this.elementBottomMenu.innerWidth(width-editorWidth);
    };

CWS.UI.prototype.createStats = function (v)
    {
        if (v===false)
            return {update:function(){}};
        var maincanvasdiv = document.getElementById("canvasContainer");
        var width = maincanvasdiv.offsetWidth;
        var height = maincanvasdiv.offsetHeight;

        stats = new Stats();
        stats.domElement.style.position = 'absolute';
        stats.domElement.style.bottom = '0px';
        stats.domElement.style.right = '0px';
        maincanvasdiv.appendChild( stats.domElement );
        return stats;
    };

CWS.UI.prototype.settingsButton = function (node, prop, cb)
    {
        if (!cb) cb = function() {};
        node = document.querySelector(node);
        node.style.color = this.controller.storage[prop] ? "green" : "red";
        node.addEventListener('click', (event) => {
            cb.call(node, event);
            node.style.color = this.controller.storage[prop] ? "green" : "red";
        });
    };

CWS.DialogBox = function (title)
    {
        $("#dialogBox").remove();

        this.dialog = $( '<div id="dialogBox" title="'+title+'" ></div>');
    }

CWS.DialogBox.prototype.constructor = CWS.DialogBox;

CWS.DialogBox.prototype.newProject = function (controller)
    {
        var html = '<form id="menuNewProject">'+
            '<ul>'+
            '  <li>'+
            '    <label for= "projectName" >Project Name</label>'+
            '    <input type= "text" name= "projectName" />'+
            '  </li>'+
            '  <li>'+
            '    <label for= "machineType" >Machine</label>'+
            '    <input type="radio" name="machineType" value="Lathe" checked> Lathe'+
            '    <input type="radio" name="machineType" value="Mill"> Mill'+
            '    <input type="radio" name="machineType" value="3D Printer"> 3D Printer'+
            '  </li>'+
            '</ul>'+
            '</form>';
        this.dialog.append($(html));
        this.dialog.dialog(
          {
          width: 400,
          buttons:
            {
                "Create": function()
                {
                    var values = {};
                    var result = $(this.firstChild).serializeArray();
                    for (var i = 0; i < result.length; i++)
                    {
                        values[result[i].name]=result[i].value;
                    }
                      controller.createProject(values);
                      $(this).dialog("close");
                },
                  "Cancel": function()
                {
                      $(this).dialog("close");
                }
            }
          });
    };

CWS.DialogBox.prototype.openProject = function (controller)
    {
        const fileList = Object.keys(controller.listProjects());
        this.projectDialogs(fileList, controller, (projectName)=>{
            controller.openProject(projectName);
        });
    }


CWS.DialogBox.prototype.deleteProject = function (controller)
    {
        const fileList = Object.keys(controller.listProjects());
        this.projectDialogs(fileList, controller, (projectName)=>{
            controller.deleteProject(projectName);
        });
    }

CWS.DialogBox.prototype.showDemos = async function (controller)
    {
        const nameList = await controller.demoNames();
        this.projectDialogs(nameList, controller, (demoName)=>{
            controller.showDemo(demoName);
        });
    }

CWS.DialogBox.prototype.projectDialogs = function (fileList, controller, callback)
    {
        html = '<ul class="tableList">';
        for (var i = 0; i < fileList.length; i++)
        {
            html += '<li><span class="icon icon-file-text2"></span>'+fileList[i]+'</li>';
        }
        html += "</ul>";
        var dialog = this.dialog;
        html = $(html).click(function (event)
            {
                if (event.target.parentElement.tagName.toLocaleLowerCase()=="div")
                    return;
                var projectName="";
                if (event.target.tagName.toLocaleLowerCase()=="li")
                {
                    projectName = event.target.textContent;
                }
                else
                {
                    projectName = event.target.parentElement.textContent;
                }
                callback(projectName);
                dialog.dialog("close");
            });
        this.dialog.append(html);
        this.dialog.dialog(
          {
          width: 400,
          buttons:
            {
                  "Cancel": function()
                {
                      $(this).dialog("close");
                }
            }
          });
    };

CWS.DialogBox.prototype.openMachine = function (controller)
    {
        html = '<ul class="tableList">'+
        '  <li><span class="icon icon-lathe"></span>Lathe</li>'+
        '  <li><span class="icon icon-mill"></span>Mill</li>'+
        '  <li><span class="icon icon-printer"></span>3D Printer</li>'+
        '</ul>';
        var dialog = this.dialog;
        html = $(html).click(function (event)
            {
                if (event.target.parentElement.tagName.toLocaleLowerCase()=="div")
                    return;
                var machineName="";
                if (event.target.tagName.toLocaleLowerCase()=="li")
                {
                    machineName = event.target.textContent;
                }
                else
                {
                    machineName = event.target.parentElement.textContent;
                }
                controller.openMachine(machineName);
                dialog.dialog("close");
            });
        this.dialog.append(html);
        this.dialog.dialog(
          {
          width: 400,
          buttons:
            {
                  "Cancel": function()
                {
                      $(this).dialog("close");
                }
            }
          });
    };

CWS.DialogBox.prototype.workpieceDimensions = function (controller)
    {
        var machineType = controller.getMachineType();
        var workpiece = controller.getWorkpiece();
        var html = "";
        if (machineType=="Lathe")
        {
            html = '<form id="workpieceDimensions">'+
            '<ul>'+
            '  <li>'+
            '    <label for= "x" >Diameter</label>'+
            '    <input type= "text" name= "x" value="'+workpiece.x+'"/>'+
            '  </li>'+
            '   <li>'+
            '    <label for= "z" >Lenght</label>'+
            '    <input type= "text" name= "z" value="'+workpiece.z+'"/>'+
            '  </li>'+
            '</ul></form>';
        }
        else if (machineType=="Mill")
        {
            html = '<form id="workpieceDimensions">'+
            '<ul>'+
            '  <li>'+
            '    <label for= "x" >Size X</label>'+
            '    <input type= "text" name= "x" value="'+workpiece.x+'"/>'+
            '  </li>'+
            '  <li>'+
            '    <label for= "y" >Size Y</label>'+
            '    <input type= "text" name= "y" value="'+workpiece.y+'"/>'+
            '  </li>'+
            '   <li>'+
            '    <label for= "z" >Size Z</label>'+
            '    <input type= "text" name= "z" value="'+workpiece.z+'"/>'+
            '  </li>'+
            '</ul></form>';
        }
        else if (machineType=="3D Printer")
        {
            html = '<form id="workpieceDimensions">'+
            '<ul>'+
            '  <li>'+
            '    <label for= "filamentDiameter" >Filament Diameter</label>'+
            '    <input type= "text" name="filamentDiameter" value="'+workpiece.filamentDiameter+'"/>'+
            '  </li>'+
            '  <li>'+
            '    <label for= "layerHeight" >Layer Height</label>'+
            '    <input type= "text" name= "layerHeight" value="'+workpiece.layerHeight+'"/>'+
            '  </li>'+
            '</ul></form>';
        }
        this.dialog.append($(html));
        this.dialog.dialog(
          {
          width: 400,
          buttons:
            {
                "Save": () => {
                    var values = {};
                    var result = $(this.firstChild).serializeArray();
                    for (var i = 0; i < result.length; i++)
                    {
                        values[result[i].name]=parseFloat(result[i].value);
                    }
                      controller.setWorkpieceDimensions(values);
                      $(this).dialog("close");
                },
                  "Cancel": () => {
                      $(this).dialog("close");
                }
            }
          });
    };

CWS.DialogBox.prototype.tool = function (controller)
    {
        var machineType = controller.getMachineType();
        if (machineType==="Lathe")
        {
            var machine = controller.getMachine();
            var html =     '<form id="menuTool">'+
                        '<ul>'+
                        '  <li>'+
                        '    <label for= "toolradius" >Tool radius</label>'+
                        '    <input type= "text" name= "toolradius" value="'+machine.tool.radius+'"/>'+
                        '  </li>'+
                        '</ul>'+
                        '</form>';
            this.dialog.append($(html));
            this.dialog.dialog(
              {
              width: 400,
              buttons:
                {
                    "Save": function()
                    {
                        var values = {};
                        var result = $(this.firstChild).serializeArray();
                        for (var i = 0; i < result.length; i++)
                        {
                            values[result[i].name]=parseFloat(result[i].value);
                        }
                          controller.setMachineTool(values);
                          $(this).dialog("close");
                    },
                      "Cancel": function()
                    {
                          $(this).dialog("close");
                    }
                }
              });
        }
        else if (machineType==="Mill")
        {
            var machine = controller.getMachine();
            var html =     '<form id="menuTool">'+
                        '<ul>'+
                        '  <li>'+
                        '    <label for= "toolradius" >Tool radius</label>'+
                        '    <input type= "text" name= "toolradius" value="'+machine.tool.radius+'"/>'+
                        '  </li>'+
                        '  <li>'+
                        '    <label for= "toolangle" >Tool angle</label>'+
                        '    <input type= "text" name= "toolangle" value="'+machine.tool.angle+'"/>'+
                        '  </li>'+
                        '</ul>'+
                        '</form>';
            this.dialog.append($(html));
            this.dialog.dialog(
              {
              width: 400,
              buttons:
                {
                    "Save": function()
                    {
                        var values = {};
                        var result = $(this.firstChild).serializeArray();
                        for (var i = 0; i < result.length; i++)
                        {
                            values[result[i].name]=parseFloat(result[i].value);
                        }
                          controller.setMachineTool(values);
                          $(this).dialog("close");
                    },
                      "Cancel": function()
                    {
                          $(this).dialog("close");
                    }
                }
              });
        }
        else
        {
            var html =     '<ul><li>'+machineType+' does not support tool settings</li></ul>';
            this.dialog.append($(html));
            this.dialog.dialog(
              {
              width: 400,
              buttons:
                {
                    "Ok": function()
                    {
                          $(this).dialog("close");
                    },
                      "Cancel": function()
                    {
                          $(this).dialog("close");
                    }
                }
              });
        }
    };

CWS.DialogBox.prototype.about = function ()
    {
        html = `
        <div class="scrollable about">
            <p>This webapp was created by
            <a href="https://github.com/filipecaixeta/cncwebsim">Filipe Caixeta</a> back in 2016. <br>
            It contained many features from the start, hovever it lacked in some regards.
            Containing some bugs and lacked a more advanced G-Code interpreter.</p>
            <p>It was pickup by
            <a href="https://github.com/mumme74/cncwebsim/tree/improvements">
                Fredrik Johansson
            </a>
            in 2025 as a preparation for a course in programming I am going to
            teach in the autumn, where the attandants are beginner students for
            industrial production.</p>
            <p>
            I figured this simulator could be a good way to learn G-code.<br>
            They only have chromebooks so it need to be webbased.
            </p>
        </div>`;
        html = $(html);
        this.dialog.append(html);
        this.dialog.dialog({
          width: 700,
          buttons: {
                "Cancel": () => {
                      $(this).dialog("close");
                }
            }
        });
    }

CWS.DialogBox.prototype.documentationGcode = function (controller)
    {
        const rows = CWS.Interpreter.commands.map(row=>{
            const desc = row.description
                            .replaceAll('\n','<br>')
                            .replaceAll(' ', '&nbsp;');
            return `<tr><td>${row.name}</td><td>${desc}</td></tr>`
        })
        html = `
        <div class="scrollable documentation">
            <table>${rows.join('\n')}</table>
        </div>`;
        var dialog = this.dialog;
        html = $(html);
        this.dialog.append(html);
        this.dialog.dialog({
          width: 700,
          buttons:
            {
                  "Cancel": () => {
                      $(this).dialog("close");
                }
            }
        });
    }

CWS.DialogBox.prototype.importFile = function (controller)
    {
        html = `
        <label for="fileopen">Coohse a poject or gcode file</label>
        <input type="file" id="fileopen" name="fileopen"
               accept="application/json, text/x-gcode, text/x.gcode, .gcode" />
        `;
        var dialog = this.dialog;
        html = $(html);
        this.dialog.append(html);
        this.dialog.dialog({
          width: 400,
          buttons:
            {
                "Ok": () => {
                    const node = dialog[0].querySelector("#fileopen");
                    const reader = new FileReader();
                    reader.addEventListener('load', e=>{
                        controller.importFile(node.value, e.target.result);
                    });
                    reader.readAsText(node.files[0]);
                    dialog.dialog("close");
                },
                "Cancel": () => {
                      $(this).dialog("close");
                }
            }
        });
    }