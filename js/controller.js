/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 * @author Fredrik Johansson / github.com/mumme74
 */

CWS.Controller = function (editor,storage,renderer,motion)
    {
        this.storage = storage;
        this.editor = editor;
        this.renderer = renderer;
        this.motion = motion;
        this.panZoomRotate = new PanZoomSelector(this);

        this.saveFlag = 0;

        const update = ()=>{
            const onUpdate = ()=>{
                this.renderer.controls.update();
                this.render();
            }
            requestAnimationFrame(onUpdate);
        }

        // ide settings
        storage.defineVariable("ideSettings.autoRun", true, update);
        storage.defineVariable("ideSettings.run3D", true, update);
        storage.defineVariable("ideSettings.run2D", true, update);
        storage.defineVariable("ideSettings.runWireframe", true, (vlu)=>{
            this.machine.meshWorkpiece.visible = vlu;
            update();
        });
        storage.defineVariable("ideSettings.cameraType", false, (vlu)=>{
            this.renderer.setCamera(vlu);
            update();
        });
        storage.defineVariable("ideSettings.gridHelper", true, (vlu)=>{
            this.renderer.setGridHelper(vlu, this.storage.gridInInches);
            update();
        });
        storage.defineVariable("ideSettings.gridInInches", false, (vlu)=>{
            this.renderer.setGridHelper(this.storage.gridHelper, vlu);
            update();
        });

        this.createDatGUI();

        // Init the storage
        if (this.storage.isFirstRun)
            this.createProject({projectName:"Untitled",machineType:"Lathe"});
        else
            this.openProject(this.storage.header.name);

        // Init the editor
        this.editor.subscribeToCodeChanged((code,ev) => {
            this.save();
            this.runInterpreter();
        });

        // Add the renderer to the container
        var cont = document.getElementById("canvasContainer");
        cont.appendChild(renderer.domElement);

        // update view on mouse events
        this._btnDown = false;
		cont.addEventListener("mousewheel", ()=>{
            this.renderer.controls.update();
            this.render();
        });
        cont.addEventListener("mousedown", () => {
            this._btnDown = true;
        });
        document.addEventListener("mouseup", () => {
            this._btnDown = false;
        })
		cont.addEventListener("mousemove", (event) => {
            if (controller._btnDown) {
                this.renderer.controls.update();
                this.render(event);
            }
        });

        this.setupKeybind();

        // Set renderer size
        this.windowResize();
        // Save changes every 60 seconds
        setInterval(() => {
                if (this.saveFlag===0)
                    return;
                this.save(true);
            }, 60000);
        $(window).bind("beforeunload", () => {
            if (this.saveFlag===0)
                return;
            this.save(true);
        });

        // notify subitems about our existance, so they can set there defaults.
        this.renderer.setController(this);
        this.motion.setController(this);

        // finally when renderer finished it's setup, create axis viewhelper
        this.dirPointer = new ViewHelper(this.renderer,
            document.querySelector("#canvasContainer"));

        // finally render it.
        requestAnimationFrame(()=>{
            if (this.storage.autoRun)
                this.interpreterRun();
        });
    };

CWS.Controller.prototype.constructor = CWS.Controller;

CWS.Controller.prototype.setupKeybind = function ()
    {
        $(window).bind('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (String.fromCharCode(e.which).toLowerCase()) {
            case 's': // Ctrl+s => save
                this.save(true);
                break;
            case '4': // Ctrl-4 => Run
                this.interpreterRun();
                break;
            case '5': // Ctrl-5 => Start debug
                this.interpreterContinue();
                break;
            case '6': // Ctrl-6 => next step
                this.interpreterNext();
                break;
            case '7': // Ctrl-7 => Step out
                this.interpreterStepOut();
                break;
            default:
                return; // don't stop event propagation
            }
            e.preventDefault();
        }});
    }

CWS.Controller.prototype.createProject = function(data)
    {
        if (data['projectName']=="" || data['projectName']===undefined)
             return;
        var projectName = this.storage.createNewProject(data['projectName'],data['machineType'],true);
        this.openProject(projectName);
        return projectName;
    };

CWS.Controller.prototype.listProjects = function()
    {
        return this.storage.projectNames;
    };

CWS.Controller.prototype.openProject = function(projectName)
    {
        this.storage.loadProject(projectName,true);

        // For old versions
        if (this.storage.machineType==="Lathe" && this.storage.machine.tool===undefined)
            {
                var machine = this.storage.machine;
                machine.tool = {radius:2,angle:0};
                this.storage.machine = machine;
            }
        this.loadMachine();
        this.editor.setCode(this.storage.code);
    };

CWS.Controller.prototype.loadMachine = function()
    {
        this.renderer.controls.reset();
        if (this.storage.machineType=="Lathe")
        {
            document.getElementById('machineIcon').className = "icon-lathe";
            this.machine = new CWS.Lathe({
                machine: this.storage.machine,
                material3D: this.material3D,
                workpiece: this.storage.workpiece,
                renderResolution: 512});
            this.renderer.lookAtLathe({x:this.storage.workpiece.x,z:this.storage.workpiece.z});
            this.renderer.addMesh("2DWorkpiece",this.machine.mesh2D);
            this.renderer.addMesh("3DWorkpiece",this.machine.mesh3D);
            this.updateWireframe();
        }
        else if (this.storage.machineType=="Mill")
        {
            document.getElementById('machineIcon').className = "icon-mill";
            this.machine = new CWS.Mill({
                machine: this.storage.machine,
                material3D: this.material3D,
                workpiece: this.storage.workpiece,
                renderResolution: 4048});
            this.renderer.lookAtMill({x:this.storage.workpiece.x,
                        y:this.storage.workpiece.y,z:this.storage.workpiece.z});
            this.renderer.addMesh("2DWorkpiece",this.machine.mesh2D);
            this.renderer.addMesh("3DWorkpiece",this.machine.mesh3D);
            this.updateWireframe();
        }
        else if (this.storage.machineType=="3D Printer")
        {
            document.getElementById('machineIcon').className = "icon-printer";
            this.machine = new CWS.Printer({
                machine: this.storage.machine,
                material3D: this.material3D,
                workpiece: this.storage.workpiece});
            this.renderer.lookAt3DPrinter({x:this.storage.machine.dimension.x,
                        y:this.storage.machine.dimension.y,z:this.storage.machine.dimension.z});
            this.renderer.addMesh("2DWorkpiece",this.machine.mesh2D);
            this.renderer.addMesh("3DWorkpiece",this.machine.mesh3D);
            this.updateWireframe();
        }
    };

CWS.Controller.prototype.openMachine = function(machine)
    {
        this.storage.machine = CWS.Project.createDefaultMachine(machine);
        this.storage.workpiece = CWS.Project.createDefaultWorkpiece(machine);
        this.loadMachine();
        this.interpreterRun();
	};

CWS.Controller.prototype.workpieceDimensions = function(dimensions)
    {
        this.storage.workpiece.dimension = dimensions;
    };

CWS.Controller.prototype.getMachineType = function()
    {
        return this.storage.machineType;
    };

CWS.Controller.prototype.getMachine = function()
    {
        return this.storage.machine;
    };

CWS.Controller.prototype.setMachineTool = function(tool)
    {
        this.storage.machine.tool.radius = parseFloat(tool['toolradius']);
        this.storage.machine.tool.angle = parseFloat(tool['toolangle']);
        this.machine.updateTool();
        this.updateWorkpieceDraw();
    };

CWS.Controller.prototype.getWorkpiece = function()
    {
        return this.storage.workpiece;
    };

CWS.Controller.prototype.setWorkpieceDimensions = function(dimensions)
    {
        var workpiece = this.storage.workpiece;
        for (var i in dimensions)
            workpiece[i] = dimensions[i];

        this.storage.workpiece = workpiece;
        this.machine.updateWorkpieceDimensions();
        switch (this.machine.mtype) {
        case "Lathe":
            this.updateWorkpieceDraw();
            this.renderer.lookAtLathe({x:this.storage.workpiece.x,y:this.storage.workpiece.z});
            break;
        case "Mill":
            this.updateWorkpieceDraw();
            this.renderer.lookAtMill({x:this.storage.workpiece.x,
                        y:this.storage.workpiece.y,z:this.storage.workpiece.z});
            break;
        case "3D Printer":
            this.interpreterRun();
            break;
        }

        this.updateWireframe();
    };

CWS.Controller.prototype.exportToOBJ = function()
    {
        console.log("Exporting");
        var filename = this.storage.header.name;
        // Problem with STL Exporter
        var exporter = new THREE.STLBinaryExporter ();
        var result = exporter.parse (this.renderer.scene);
        var element = document.createElement('a');
        var blob = new Blob([result], {type: 'text/plain'});
        element.setAttribute('href', URL.createObjectURL(blob));
        element.setAttribute('download', filename+".stl");

        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

CWS.Controller.prototype.createDatGUI = function ()
    {
        if (document.getElementById("gui"))
            document.getElementById("gui").remove();

        var _this = this;
        function sett(key, defVlu)
        {
            return _this.storage.getObjData("ideSettings", key, defVlu);
        }

        var material3D = new THREE.MeshStandardMaterial(
        {
            color:  sett("color", 0xff4400),
            shading: THREE.SmoothShading,
            emissive: sett("emissive", 0xff4400),
            blending:0,
            alphaTest:0,
            transparent:false,
            wireframe:false,
            refractionRatio:0.98,
        });
        material3D.metalness=sett("metalness", 0.0);
        material3D.roughness=sett("roughness", 0.0);
        material3D.opacity=1;
        material3D.visible=sett("visible", true);
        material3D.side = THREE.DoubleSide;

        function handleColorChange ( color, settKey )
        {
            return function ( value )
            {
                if (typeof value === "string")
                {
                    value = value.replace('#', '0x');
                }
                _this.storage[`ideSettings.settKey`] = parseInt(value);
                color.setHex( value );
            };
        };
        var gui = new dat.GUI({ autoPlace: false });
        gui.domElement.id = 'gui';
        gui.close();
        document.getElementById("canvasContainer").appendChild(gui.domElement);
        var data =
        {
            color : material3D.color.getHex(),
            emissive : material3D.emissive.getHex(),
        };
        var folder = gui.addFolder('Material');
        //        folder.add( material3D,'transparent');
        //        folder.add( material3D, 'opacity', 0, 1 );
        folder.add( material3D, 'metalness', 0, 1 );
        folder.add( material3D, 'roughness', 0, 1 );
        folder.add( material3D, 'visible' );
        folder.addColor( data, 'color' ).onChange(
            handleColorChange( material3D.color, "color" ) );
        folder.addColor( data, 'emissive' ).onChange(
            handleColorChange( material3D.emissive, "emissive" ) );
        folder.add( material3D, 'wireframe' );
        //        folder.add( material3D, 'refractionRatio', 0, 1 );
        const setData = {
            'Orthographic camera': this.storage.cameraType,
            'Gridhelper':          this.storage.gridHelper,
            'Grid in Inches':      this.storage.gridInInches
        }

        const settings = gui.addFolder("Settings");
        settings.add(setData, 'Orthographic camera').onChange((vlu) => {
            this.storage.cameraType = vlu;
        });
        settings.add(setData, 'Gridhelper').onChange((vlu) => {
            this.storage.gridHelper = vlu;
        });
        settings.add(setData, 'Grid in Inches').onChange((vlu) => {
            this.storage.gridInInches = vlu;
        });

        this.material3D = material3D;
    };

CWS.Controller.prototype.runGCode = function()
    {
        this.editor.codeChanged();
    };
CWS.Controller.prototype.setEditor = function()
    {
        this.editor.codeChanged();
    };

CWS.Controller.prototype.windowResize = function()
    {
        var maincanvasdiv = document.getElementById("canvasContainer");
        this.renderer.controls.handleResize();
        this.renderer.setSize(maincanvasdiv.offsetWidth,
                              maincanvasdiv.offsetHeight);
    };

CWS.Controller.prototype.render = function(forceUpdate)
    {
        this.renderer.render();
        this.dirPointer?.render();
    };

CWS.Controller.prototype.save = function(forceSave)
    {
        // Set the number of changes to save the code
        var changes = 30;
        if (forceSave===true)
            this.saveFlag=Infinity;
        this.saveFlag++;
        // Don't save
        if (this.saveFlag<changes)
            $("#saveIcon").css('color', 'red');
        // Save
        else {
            $("#saveIcon").css('color', 'green');
            this.saveFlag=0;
            // wait 3s before autosave, let us breathe a little...
            clearTimeout(CWS.Controller._savetimer);
            var _this = this;
            CWS.Controller._savetimer = setTimeout(function(){
                _this.storage.code = _this.editor.getCode();
            }, forceSave ? 3000 : 0);
        }
    };

CWS.Controller.prototype._initInterpreter = function()
    {
        const code = this.editor.getCode();
        const breakPnts = Object.keys(
            this.editor.editor.getSession().getBreakpoints()).map(v=>+v);
        this.motion.setData({ header:this.storage.header, code:code});
        this.motion.setBreakpoints(breakPnts);
    }

CWS.Controller.prototype.interpreterRun = function(forceRun)
    {
        if (!this.storage.autoRun && !forceRun)
            return;
        // Don't update before have typed to the end
        clearTimeout(CWS.Controller._interpretTmr);
        CWS.Controller._interpretTmr = setTimeout(() => {
            this._initInterpreter();
            this.displayMessage("Running G Code");
            this.motion.run();
        }, forceRun ? 3000 : 0);
    };

CWS.Controller.prototype.interpreterContinue = function()
    {
        this._initInterpreter();
        this.displayMessage("Debugging G Code");
        this.motion.contin();
    }

CWS.Controller.prototype.interpreterNext = function()
    {
        this.motion.next();
    }

CWS.Controller.prototype.interpreterStepOut = function()
    {
        this.motion.stepOut();
    }

CWS.Controller.prototype.interpreterStop = function()
    {
        this.motion.stop();
        this.editor.setCurrentLine(-1, this.motion.state);
    }

CWS.Controller.prototype.updateWorkpieceDraw = function()
    {
        var mesh;
        var boundingSphere=this.machine.boundingSphere;
        this.displayMessage("Generating geometry");

        this.update2D();
        this.update3D();

        if (this.machine.mtype==="3D Printer" && boundingSphere===false)
            this.renderer.lookAt3DPrinter(
                this.machine.boundingSphere.center,
                this.machine.boundingSphere.radius);

        if (this.machine.motionData.error.length!==0)
        {
            this.displayMessage(this.machine.motionData.error[0].message,true);
            const errArr = [];
            for (const e of this.machine.motionData.error)
                errArr.push({row:e.line-1, type:"error", text:e.message});
            this.editor.editor.getSession().setAnnotations(errArr);
        }
        else
        {
            this.displayMessage();
            this.editor.editor.getSession().setAnnotations([]);
            this.render();
        }
    };

CWS.Controller.prototype.update2D = function()
    {
        if (this.storage.run2D)
            this.machine.create2DWorkpiece();
        this.machine.mesh2D.visible = this.storage.run2D;
    };

CWS.Controller.prototype.update3D = function()
    {
        if (this.storage.run3D)
            this.machine.create3DWorkpiece();
        this.machine.mesh3D.visible = this.storage.run3D;
    };

CWS.Controller.prototype.updateWireframe = function()
    {
        this.renderer.addMesh("2DWorkpieceDash",this.machine.meshWorkpiece);
        this.render();
    };

CWS.Controller.prototype.runAnimation = function(animate)
    {
        this.renderer.animate("2DWorkpiece", ()=>this.controls.update());
        this.renderer.animate("3DWorkpiece", ()=>this.controls.update());
    };

CWS.Controller.prototype.displayMessage = function(message,error)
    {
        if (message===undefined)
            $("#messages").text("");
        else if (error===true)
            $("#messages").css('color','red').text(message);
        else
            $("#messages").css('color','black').text(message);
    };
