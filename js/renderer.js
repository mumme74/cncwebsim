/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 * @author Fredrik Johansson / gihub.com/mumme74
 */


CWS.Renderer = function (id,options)
    {
        options = options || {};

        this.container = document.getElementById("canvasContainer");
        const rect  = this.container.getBoundingClientRect();
        this.width  = options.width  || rect.width;
        this.height = options.height || rect.height;
        this._runningAnim = [];

        this.controller = null; // set by controller in constructor

        this.displayWireframe = options.displayWireframe===undefined
                              ? true : options.displayWireframe;

        this.renderer = new THREE.WebGLRenderer({clearColor: 0xffffff,antialias: true });
        // this.renderer.domElement.style.background = "#ffffff";
        this.renderer.autoClear = true;
        this.renderer.setClearColor( 0xffffff );
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.setSize(this.width, this.height);

        this.renderer.domElement.id=id;
        this.renderer.domElement.style['z-index']=41;

        // Add the renderer to the container
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();

        var ambientLight = new THREE.AmbientLight( 0x000000 );
        this.scene.add( ambientLight );

        var lights = [];
        lights[0] = new THREE.PointLight( 0xffffff, 1, 0 );
        lights[1] = new THREE.PointLight( 0xffffff, 1, 0 );
        lights[2] = new THREE.PointLight( 0xffffff, 1, 0 );

        lights[0].position.set( 0, 200, 0 );
        lights[1].position.set( 100, 200, 100 );
        lights[2].position.set( -100, -200, -100 );

        this.scene.add( lights[0] );
        this.scene.add( lights[1] );
        this.scene.add( lights[2] );

        // var ambientLight = new THREE.AmbientLight( Math.random() * 0x10 );
        // this.scene.add( ambientLight );

        // var directionalLight = new THREE.DirectionalLight( Math.random() * 0xffffff );
        // directionalLight.position.x = Math.random() - 0.5;
        // directionalLight.position.y = Math.random() - 0.5;
        // directionalLight.position.z = Math.random() - 0.5;
        // directionalLight.position.normalize();
        // this.scene.add( directionalLight );

        // var directionalLight = new THREE.DirectionalLight( Math.random() * 0xffffff );
        // directionalLight.position.x = Math.random() - 0.5;
        // directionalLight.position.y = Math.random() - 0.5;
        // directionalLight.position.z = Math.random() - 0.5;
        // directionalLight.position.normalize();
        // this.scene.add( directionalLight );

        // create 2 cameras so we can switch later.
        this.orthoCam = new THREE.OrthographicCamera(
                        -this.width/2, this.width/2,
                        this.height/2, -this.height/2,
                        0.1, 20000);
        this.persCam = new THREE.PerspectiveCamera(20,
            this.width / this.height, 0.1, 20000);
        this.camera = this.persCam;

        // Create controls
        this.controls = new THREE.TrackballControls(
            this.camera ,this.renderer.domElement);
        this.controls.rotateSpeed = 5.0;
        this.controls.zoomSpeed = 2;
        this.controls.panSpeed = 0.4;
        this.controls.noZoom = false;
        this.controls.noPan = false;
        this.controls.staticMoving = true;
        this.controls.dynamicDampingFactor = 0.3;

        //zoom for orthocam
        let lastDistance = this.orthoCam.position
                               .distanceTo(this.controls.target);
        this.controls.addEventListener('change', (ev)=>{
            const distance = this.orthoCam.position
                                 .distanceTo(this.controls.target);
            if (Math.abs(lastDistance - distance) > 0.001)
                this.updateFrustum(); // only on zoom
            lastDistance = distance;
        });

        this.camera.position.x = 0;
        this.camera.position.y = 0;
        this.camera.position.z = 100;
        this.camera.lookAt( this.scene.position );
    }

CWS.Renderer.prototype.constructor = CWS.Renderer;

CWS.Renderer.prototype.setController = function (controller)
    {
        this.controller = controller;
        const store = controller.storage;
        this.setCamera(store.cameraType);
        this.setGridHelper(store.gridHelper, store.gridInInches);
    }

CWS.Renderer.prototype.lookAtLathe = function (dimensions)
    {
        var aspect = this.camera.aspect;
        var fov = 20;
        const maxDist = Math.max(dimensions.x, dimensions.z);
        var distance = maxDist/2/Math.tan((fov/2) * (Math.PI/180));
        // needed to nudge x a little so orbitcontrol didn't lock
        // therefore 0.000....1 instead of 0
        var cameraPosition = new THREE.Vector3(0.000001,distance,0);
        this.camera.position.copy( cameraPosition );
        this.camera.rotation.set(0, Math.PI, 0);
        this.controls.update();
        this.camera.far = 20 * maxDist;
        this.camera.near = 0.05 * maxDist;
        this.camera.updateProjectionMatrix();
    };

CWS.Renderer.prototype.lookAtMill = function (dimensions)
    {
        var aspect = this.camera.aspect;
        var fov = 20;
        var distance = Math.max(dimensions.x,dimensions.y)/2/Math.tan( (fov/2)  * (Math.PI/180)  );
        var cameraPosition = new THREE.Vector3(0,0,distance);
        this.camera.position.copy( cameraPosition );
        this.camera.far = 20*Math.max(dimensions.x,dimensions.y);
        this.camera.near = 0.001*Math.max(dimensions.x,dimensions.y);
        this.camera.updateProjectionMatrix();
    };

CWS.Renderer.prototype.lookAt3DPrinter = function (center,radius)
    {
        if (!center || !radius)
            return;

        var distance =(center.z+radius)/2/Math.tan( (20/2)  * (Math.PI/180)  );
        var cameraPosition = new THREE.Vector3(0,0,distance);
        this.camera.position.copy( cameraPosition );
        this.camera.far = 2000;
        this.camera.near = 1;
        this.camera.updateProjectionMatrix();
    };

CWS.Renderer.prototype.updateFrustum = function() {
    const distance = this.orthoCam.position.distanceTo(this.controls.target);
    const frust = this.frustrumFromPersCam(distance);
    this.orthoCam.top = frust.height;
    this.orthoCam.bottom = -frust.height;
    this.orthoCam.left = -frust.width;
    this.orthoCam.right = frust.height;
    this.camera.updateProjectionMatrix();
  }


CWS.Renderer.prototype.frustrumFromPersCam = function(distance)
    {
        const sz = this.renderer.getSize()
              aspect = sz.width / sz.height;
        if (!distance)
            distance = this.persCam.position.distanceTo(
                            this.controls.target);

        const vFov = (this.persCam.fov * Math.PI) / 180,
              height = Math.tan(vFov / 2) * distance * 2,
              width = height * this.persCam.aspect;
        return {width, height};
    }

CWS.Renderer.prototype.toOrthographic = function()
    {
        const frust = this.frustrumFromPersCam();
        this.orthoCam.position.copy(this.persCam.position);

        const halfWidth = frust.width / 2;
        const halfHeight = frust.height / 2;
        this.orthoCam.top = halfHeight;
        this.orthoCam.bottom = -halfHeight;
        this.orthoCam.left = -halfWidth;
        this.orthoCam.right = halfWidth;
        this.orthoCam.zoom = 1;
        this.orthoCam.lookAt(this.controls.target);
        this.orthoCam.updateProjectionMatrix();
        this.camera = this.orthoCam;
        this.controls.object = this.orthoCam;
    }

CWS.Renderer.prototype.toPerspective = function()
    {
        const oldY = this.persCam.position.y;
        this.persCam.position.copy(this.orthoCam.position);
        this.persCam.position.y = oldY / this.orthoCam.zoom;
        this.persCam.updateProjectionMatrix();
        this.camera = this.persCam;
        this.controls.object = this.persCam;
    }

CWS.Renderer.prototype.setCamera = function (camera)
    {
        if ((camera=="Perspective" || camera === false) &&
            this.camera == this.orthoCam
        )
            this.toPerspective();
        else if ((camera=="Orthographic" || camera === true) &&
            this.camera == this.persCam
        )
            this.toOrthographic();
    }

CWS.Renderer.prototype.setSize = function (width,height)
    {
        this.width = width;
        this.height = height;
        this.persCam.aspect = this.width / this.height;
        this.persCam.updateProjectionMatrix();

        const frust = this.frustrumFromPersCam();
        this.orthoCam.left   = -frust.width/2;
        this.orthoCam.right  = frust.width/2;
        this.orthoCam.top    = frust.height/2;
        this.orthoCam.bottom = -frust.height/2;
        this.orthoCam.updateProjectionMatrix();
        this.renderer.setSize( this.width, this.height );
    };

CWS.Renderer.prototype.removeMesh = function (meshName)
    {
        if (meshName!==undefined)
        {
            var mesh = this.scene.getObjectByName(meshName);
            if (mesh)
                this.scene.remove(mesh);
        }
    };

CWS.Renderer.prototype.render = function ()
    {
        const doAnim = (workpiece) => {
            if (workpiece && workpiece.animation &&
                workpiece.animation.next
            )
                workpiece.animation.next(this);
        }

        doAnim(this['2DWorkpiece']);
        doAnim(this['3DWorkpiece']);

        this.controls.update();
        this.renderer.render( this.scene, this.camera );
    };

CWS.Renderer.prototype.animate = function (meshName)
    {
        if (this[meshName] && this[meshName].animation)
        {
            this._runningAnim.push({
                cb:this.controls.update.bind(this),
                anim: this[meshName].animation});
            this[meshName].animation.toggleAnimation(this);
        }

        // contiue each frame until animations are done
        let cnt = 0;
        const eachFrm = (time)=>{
            if (this._animationFrame === time) return; // already done this frame
            for (const o of this._runningAnim)
             { o.anim.next(this); o.cb() }
            this._animationFrame = time;
            if (this._runningAnim.length) {
                requestAnimationFrame(eachFrm);
                if (cnt++ % 10 == 0)
                    this.renderer.render(this.scene, this.camera);
            }
        }
        requestAnimationFrame(eachFrm);
    };

CWS.Renderer.prototype.animateFinished = function(anim)
    {
        var idx = this._runningAnim.findIndex(o=>o.anim === anim);
        if (idx !== -1) {
            const anim = this._runningAnim.splice(idx,1);
            if (anim[0].cb) anim[0].cb();
        }
        this.render(); // trailing render at the end
    };

CWS.Renderer.prototype.animate = function (meshName, cb)
    {
        if (!this[meshName] || !this[meshName].animation)
            return cb();

        this._runningAnim.push({
            cb:cb || function(){},
            anim: this[meshName].animation});
        this[meshName].animation.toggleAnimation(this);


        const num = this[meshName].geometry.getAttribute('position').count,
              speed = Math.ceil(30/num);
        // contiNue each frame until animations are done
        let cnt = 0;
        const eachFrm = (time)=>{
            if (this._animationFrame === time) return; // already done this frame
            for (const o of this._runningAnim)
                o.anim.next(this)
            this._animationFrame = time;
            if (this._runningAnim.length) {
                requestAnimationFrame(eachFrm);
                if (cnt++ % speed == 0)
                    this.renderer.render(this.scene, this.camera);
            }
        }
        requestAnimationFrame(eachFrm);
    };

CWS.Renderer.prototype.addMesh = function (meshName,mesh)
    {
        var meshTemp = this.scene.getObjectByName(meshName);
        if (meshTemp)
        {
            this.scene.remove(meshTemp);
            this[meshName] = undefined;
        }
        if (mesh.geometry !== undefined)
        {
            mesh.name = meshName;
            if (mesh instanceof THREE.BufferGeometry)
                mesh.geometry.setDrawRange(0,Infinity);
            this[meshName] = mesh;
            this.scene.add(mesh);
        }
    };

CWS.Renderer.prototype.setGridHelper = function (on, inInches)
    {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper.dispose();
            delete this.gridHelper;
        }

        if (on) {
            const normalPlane = this.controller.machine.normalPlane,
                  workpiece   = this.controller.machine.workpiece,
                  defaultSize =500,
                  size = Math.max(defaultSize, workpiece.x,
                                  workpiece.y || workpiece.z);
            this.gridHelper = new UnitGrid(
                inInches, size || defaultSize, normalPlane !== 'XY');
            this.scene.add(this.gridHelper);
            this.render();
        }
    }
