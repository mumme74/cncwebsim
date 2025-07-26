/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 * @author Fredrik Johansson / github.com/mumme74
 */


// Keys: currentProjectCode, currentProjectHeader, projects, ideSettings
CWS.Storage = function (options)
    {
        options = options || {};
        this.useCompression = (options.useCompression===undefined)?true:options.useCompression;
        this.useLocalStorage = (options.useLocalStorage===undefined)?true:options.useLocalStorage;
        // storage can be localStorage or a dictionary
        this.storage = {};
        this._cache = {};
        this.isAvailable = false;
        this.isFirstRun = false;
        this.currentProjectHeaderCache = {};
        this.projectsNameCache = {};
        // All keys to check for when booting
        this._keys = [
            {name: "currentProjectCode", defVlu: ""},
            {name: "projects", defVlu: {}},
            {name: "ideSettings", defVlu: {}},
            {name: "currentProjectHeader", defVlu: {}}
        ];
        this.version = 0.1;

        this.storageAvailable();
//         this.reset();
        this.storageCheckKeys();
    };
// For external access
CWS.Storage.prototype =
    {
        get code()
        {
            return this.getData("currentProjectCode");
        },
        set code(val)
        {
            this.saveCurrentProjectCode(val);
        },
        get machine()
        {
            return this.currentProjectHeaderCache.machine;
        },
        set machine(val)
        {
            this.currentProjectHeaderCache.machine = val;
            this.saveCurrentProjectHeader(this.currentProjectHeaderCache);
        },
        get machineType()
        {
            return this.currentProjectHeaderCache.machine.mtype;
        },
        set machineType(val)
        {
            this.currentProjectHeaderCache.machine.mtype = val;
            this.saveCurrentProjectHeader(this.currentProjectHeaderCache);
        },
        get workpiece()
        {
            return this.currentProjectHeaderCache.workpiece;
        },
        set workpiece(val)
        {
            this.currentProjectHeaderCache.workpiece=val;
            this.saveCurrentProjectHeader(this.currentProjectHeaderCache);
        },
        get header()
        {
            return this.currentProjectHeaderCache;
        },
        set header(val)
        {
            this.saveCurrentProjectHeader(this.currentProjectHeaderCache);
        },
        get projectNames()
        {
            return this.projectsNameCache;
        },
    };

CWS.Storage.prototype.constructor = CWS.Storage;
// Check if local storage is available and create
CWS.Storage.prototype.storageAvailable = function ()
    {
        if (this.useLocalStorage == true)
        {
            this.storage = window["localStorage"];
            try
            {
                var x = '__storage_test__';
                this.storage.setItem(x, x);
                this.storage.removeItem(x);
                this.isAvailable = true;
            }
            catch(e)
            {
                this.useLocalStorage = false;
            }
        }
        if (this.useLocalStorage == false)
        {
            // If local storage is not available create
            // an object with the same interface to keep
            // the application running
            this.storage =
            {
                data: {},
                getItem: function (key)
                {
                    return (this.data[key] || null);
                },
                setItem: function (key,data)
                {
                    this.data[key] = data;
                },
                removeItem: function (key)
                {
                    delete this.data[key];
                },
            };
            this.isAvailable = false;
        }
    };
// Create the missing keys
CWS.Storage.prototype.storageCheckKeys = function ()
    {
        // add them if non existant, ie: first run
        this._keys.forEach(function(obj){
            var data = this.storage.getItem(obj.name);
            if (data === null) {
                this.saveData(obj.defVlu);
                this.isFirstRun = true;
            }
        }, this);

        data = this.getData("projects");
        this.projectsNameCache = {};
        for (var i in data)
        {
            this.projectsNameCache[i] = data[i].header.machine.mtype;
        }

        data = this.getData("currentProjectHeader");
        if (!data.name || !data.machine?.mtype)
            this.isFirstRun = true; // first time or something got messed up.
        else {
            this.currentProjectHeaderCache = data;
            this.projectsNameCache[data.name] = data.machine.mtype;
        }
    };

CWS.Storage.prototype.getData = function (key, defaultVlu)
    {
        var data = this.storage.getItem(key);
        if (this.useCompression==true)
        {
            data = LZString.decompress(data);
        }
        data = JSON.parse(data);
        if (data !== undefined)
            return data;
        return defaultVlu;
    };

// get data from subobject
CWS.Storage.prototype.getObjData = function (key, objKey, defVlu)
    {
        var data = this.getData(key);
        if (objKey in data)
            return data[objKey];
        return defVlu;
    };

CWS.Storage.prototype.saveData = function (key,data)
    {
        var _data = JSON.stringify(data);
        if (this.useCompression==true)
        {
            _data = LZString.compress(_data);
        }
        this.storage.setItem(key,_data);
    };

CWS.Storage.prototype.defineVariable = function(key, defaultVlu, setCb) {
    const keys = key.split('.');
    if (keys.length < 2) {
        Object.defineProperty(CWS.Storage.prototype, key, {
            get() {
                if (key in this._cache)
                    return this._cache[key];
                 const vlu = this.getData(key, defaultVlu);
                 if (vlu !== undefined)
                    this._cache[key] = vlu;
                return vlu;
            },
            set(vlu) {
                this.setData(key, vlu);
                this._cache[key] = vlu;
                if (setCb) setCb(vlu);
             }
        });
        return this.getData(key);
    }

    Object.defineProperty(CWS.Storage.prototype, keys[1], {
        get() {
            if (keys[0] in this._cache && keys[1] in this._cache[keys[0]])
                return this._cache[keys[0]][keys[1]];
            const vlu = this.getObjData(keys[0], keys[1], defaultVlu);
            if (!(keys[0] in this._cache))
                this._cache[keys[0]] = {}
            this._cache[keys[0]][keys[1]] = vlu;
            return vlu;
        },
        set(vlu) {
            this.setObjData(keys[0], keys[1], vlu);
            if (!(keys[0] in this._cache))
                this._cache[keys[0]] = {}
            this._cache[keys[0]][keys[1]] = vlu;
            if (setCb) setCb(vlu);
        }
    });
    return this.getObjData(keys[0], keys[1], defaultVlu);
}

// save object data
CWS.Storage.prototype.setObjData = function (key, objKey, newVlu)
    {
        var data = this.getData(key);
        data[objKey] = newVlu;
        this.saveData(key, data);
    };

CWS.Storage.prototype.saveCurrentProjectCode = function (code)
    {
        this.saveData("currentProjectCode",code);
    };

CWS.Storage.prototype.saveCurrentProjectHeader = function (header)
    {
        this.currentProjectHeaderCache = header;
        this.saveData("currentProjectHeader",header);
    };

CWS.Storage.prototype.saveProjects = function (projects)
    {
        this.projectsNameCache = {};
        for (var i in projects)
        {
            this.projectsNameCache[i] = projects[i].header.machine.mtype;
        };
        this.saveData("projects",projects);
    };
// Create a new project.
// If the project already exists and unique name will be created.
// Set saveCurrent to true to make sure the current opened project will be saved.
CWS.Storage.prototype.createNewProject = function (
        projectName, machine, workpiece, saveCurrent
    ) {
        if (saveCurrent==true)
            this.saveCurrentProjectToProjectsList();
        var project = CWS.Project.createDefaultProject(machine, workpiece);
        project.header.name = this.getUniqueProjectName(projectName);
        this.saveCurrentProjectCode(project.code);
        this.saveCurrentProjectHeader(project.header);
        this.projectsNameCache[project.header.name]=project.header.machine.mtype;
        return project.header.name;
    };

CWS.Storage.prototype.loadProject = function (projectName,saveCurrent)
    {
        if (saveCurrent==true)
            this.saveCurrentProjectToProjectsList();
        var projects = this.getData("projects");
        if (projects[projectName]!==undefined)
        {
            this.saveCurrentProjectHeader(projects[projectName].header);
            this.saveCurrentProjectCode(projects[projectName].code);
        }
    };

CWS.Storage.prototype.saveCurrentProjectToProjectsList = function ()
    {
        var currentProject = {};
        currentProject.header = this.getData("currentProjectHeader");
        if (!currentProject.header.name || !currentProject.header?.mtype)
            return;
        currentProject.code = this.getData("currentProjectCode");
        if (!currentProject.code)
            return;
        var projects = this.getData("projects");
        projects[currentProject.header.name] = currentProject;
        this.saveProjects(projects);
    };

CWS.Storage.prototype.currentProjectToJson= function ()
    {
        const currentProject = {
            header: this.getData("currentProjectHeader"),
            version: this.version,
            code:   this.getData("currentProjectCode")
        };
        return JSON.stringify(currentProject, null, 2);
    }

CWS.Storage.prototype.addProject = function(filename, project)
    {
        if (filename.endsWith('.json'))
            filename = filename.substring(0, filename.length-5);
        else if (!filename)
            filename = project.name;

        if (!project.version || project.version > this.version)
            throw "Wrong version";

        const name = this.getUniqueProjectName(filename);
        var projects = this.getData("projects");
        projects[name] = project;
        this.saveProjects(projects);

        return name;
    }

CWS.Storage.prototype.deleteProject = function (projname)
    {
        if (projname in this.projectsNameCache) {
            var projects = this.getData("projects");
            delete projects[projname];
            this.saveProjects(projects);
        }
    }

CWS.Storage.prototype.getUniqueProjectName = function (projectName)
    {
        if (projectName in this.projectsNameCache)
        {
            var i=0;
            var key;
            do
            {
                i++;
                key=projectName+"("+i+")";
            }while(key in this.projectsNameCache);
            projectName = key;
        }
        return projectName;
    };

CWS.Storage.prototype.reset = function ()
    {
        this.storage.clear();
    }
