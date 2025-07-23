/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 */


CWS.Renderer = function (id,options)
	{
		options = options || {};

		this.container = document.getElementById("canvasContainer");
		const rect  = this.container.getBoundingClientRect();
		this.width  = options.width  || rect.width;
		this.height = options.height || rect.height;

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

CWS.Renderer.prototype =
	{
		get domElement()
		{
			return this.renderer.domElement;
		},
		set domElement(val)
		{
			this.renderer.domElement = val;
		},
	};

CWS.Renderer.prototype.constructor = CWS.Renderer;

CWS.Renderer.prototype.setController = function (controller)
	{
		this.controller = controller;
		this.setCamera(this.controller.cameraType);
		this.setGridHelper(this.controller.gridHelper,
						   this.controller.gridInInches);
	}

CWS.Renderer.prototype.lookAtLathe = function (dimensions)
	{
		var aspect = this.camera.aspect;
		var fov = 20;
		var distance = dimensions.y/2/Math.tan( (fov/2)  * (Math.PI/180)  );
		var cameraPosition = new THREE.Vector3(0,0,distance);
		this.camera.position.copy( cameraPosition );
		this.camera.far = 20*Math.max(dimensions.x,dimensions.y);
		this.camera.near = 0.05*Math.max(dimensions.x,dimensions.y);
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
		this.camera.near = 0.05*Math.max(dimensions.x,dimensions.y);
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
		if (this['2DWorkpiece'] && this['2DWorkpiece'].animation)
		{
			this['2DWorkpiece'].animation.next()
		}
		if (this['3DWorkpiece'] && this['3DWorkpiece'].animation)
		{
			this['3DWorkpiece'].animation.next();
		}

        this.controls.update();
		this.renderer.render( this.scene, this.camera );
	};

CWS.Renderer.prototype.animate = function (b,meshName)
	{
		if (this[meshName] && this[meshName].animation)
			this[meshName].animation.touggleAnimation();
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
			this.gridHelper = new UnitGrid(inInches, 500);
			this.scene.add(this.gridHelper);
		}
	}
