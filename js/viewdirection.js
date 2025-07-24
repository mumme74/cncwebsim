/**
 * @author Fredrik Johansson / github.com/mumme74
 * create an axis direction viewhelper.
 * expects #dirhelper or .dirhlper css with position absolute
 * as that will be the container for this separate canvas
 * Based of an example from ViewHelper in Threejs
 */

class ViewHelper {
    constructor(editor, container ) {
        this.dim = 128;
        Object.freeze(this.dim);

        this.editor = editor;
        this.container = document.createElement('div');
        this.container.name='#dirhelper';
        this.container.className = 'viewhelper';
        container.appendChild(this.container);

        this.#setupScene();
        this.#makeParts();

        this.targetPosition = new THREE.Vector3();
        this.targetQuaternion = new THREE.Quaternion();

        this.q1 = new THREE.Quaternion();
        this.q2 = new THREE.Quaternion();
        this.center = new THREE.Vector3();
        this.radius = 0;
        this.deltaT = 0;
    }

    #setupScene() {
        this.renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.setSize(this.dim, this.dim);

        this.renderer.domElement.id= "viewhelper";
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();

        this.camera = new THREE.OrthographicCamera( - 2, 2, 2, - 2, 0, 4 );
        this.camera.position.set( 0, 0, 2 );

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.controls.enableZoom = false;
        this.controls.enableRotate = false;
        this.camera.addEventListener('change', (e)=>this.update(e));

        this.light = new THREE.AmbientLight(0xffaaff);
        this.light.position.set(10, 10, 10);
        this.scene.add(this.light);

        this.animating = false;

        this.container.addEventListener( 'pointerup', ( event ) => {
            event.stopPropagation();
            this.#handleClick( event );
        } );

        this.container.addEventListener( 'pointerdown', ( event ) => {
            event.stopPropagation();
        } );
    }

    #makeParts() {
        this.colors = {
            x: new THREE.Color( '#ff3653' ),
            y: new THREE.Color( '#8adb00' ),
            z: new THREE.Color( '#2c8fff' )
        }

        this.interactiveObjects = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        const geometry = new THREE.BoxGeometry( 0.8, 0.05, 0.05 ).translate( 0.4, 0, 0 );

        this.axis = {
            x: new THREE.Mesh( geometry, this.#getAxisMaterial(this.colors.x)),
            y: new THREE.Mesh( geometry, this.#getAxisMaterial(this.colors.y)),
            z: new THREE.Mesh( geometry, this.#getAxisMaterial(this.colors.z))
        }
        this.axis.y.rotation.z = Math.PI / 2;
        this.axis.z.rotation.y = - Math.PI / 2;

        for (const ax of Object.values(this.axis))
            this.scene.add(ax);

        // create the dots at the ends
        this.axisHelpers = {x:{},y:{},z:{}};
        let i = 0;
        for (const ch of "xyzxyz") {
            const sign = i < 3 ? 'pos' : 'neg';
            const material = this.#getSpriteMaterial(
                this.colors[ch], i < 3 ? ch : null);
            const help = this.axisHelpers[ch][sign] = new THREE.Sprite(material);
            help.userData.type = `${sign}${ch.toUpperCase()}`;
            help.position[ch] = i < 3 ? 1 : -1;
            if (i++ > 2) help.scale.setScalar(0.8);
            this.scene.add(help);
            this.interactiveObjects.push(help);
        }

        this.point = new THREE.Vector3();

        // make a home buttons
        const homeButtons = {
            xy: {userData:{type:'xyPlane'}},
            xz: {userData:{type:'xzPlane'}}
        };
        for (const [name, tgt] of Object.entries(homeButtons)) {
            const xy = document.createElement('span');
            xy.innerText = name;
            xy.classList.add(`viewhelper_${name}`);
            xy.style.cssText = "position:absolute;";
            this.container.appendChild(xy);
            xy.addEventListener('click', ()=>{
                this.#prepareAnimationData(tgt, this.center);
            });
        }
    }

    render () {
        this.scene.quaternion.copy( this.editor.camera.quaternion).inverse();

        this.scene.updateMatrixWorld();

        this.point.set( 0, 0, 1 );
        this.point.applyQuaternion( this.editor.camera.quaternion );

        for ( const ch of "xyz") {
            const opacP = this.point[ch] >= 0 ? 1 : 0.5,
                  opacN =  this.point[ch] < 0 ? 0.5 : 1;
            this.axisHelpers[ch].pos.material.opacity = opacP;
            this.axisHelpers[ch].pos.material.opacity = opacN;
        }

        this.renderer.clearDepth();
        this.renderer.render( this.scene, this.camera );
    }

     // Should be removed when updating THREE
    angleTo(qMe, qOther) {
        const clamp = Math.max(- 1, Math.min(qMe.dot(qOther), 1));
        return 2 * Math.acos( Math.abs(clamp));
    }

    // Should be removed when updating THREE
    rotateTowards(qDst, qSrc, step) {

        const angle = this.angleTo(qDst, qSrc);
        if (angle === 0)
            return this;

        const t = Math.min(1, step / angle);
        qDst.slerp(qSrc, t);
    }

    update ( delta ) {
        if (!this.deltaT)
            this.deltaT = delta;

        const step = (delta-this.deltaT) * 2*Math.PI * 0.0001;

        // animate position by doing a slerp and then scaling the position on the unit sphere
        this.rotateTowards(this.q1, this.q2, step );
        this.editor.camera.position
            .set( 0, 0, 1 )
            .applyQuaternion( this.q1 )
            .multiplyScalar(this.radius )
            .add(this.center);

        // animate orientation
        this.rotateTowards(this.editor.camera.quaternion,
                           this.targetQuaternion, step);

        if (this.angleTo(this.q1, this.q2) === 0)
            this.animating = false;
        else
            requestAnimationFrame(this.update.bind(this))
    }

    #handleClick ( event ) {
        if (this.animating === true) return false;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x =  ((event.clientX - rect.left)
                            / (rect.width - rect.left)) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top)
                            / (rect.bottom - rect.top)) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(
                                this.interactiveObjects );

        if ( intersects.length > 0 ) {
            const object = intersects[0].object;

            this.#prepareAnimationData(object, this.center);

            this.animating = true;
            return true;
        }

        this.renderer.render(this.scene, this.camera);

        return false;
    }

    #prepareAnimationData( object, focusPoint ) {
        this.editor.camera.up = THREE.Object3D.DefaultUp.clone();

        switch (object.userData.type) {
        case 'posX':
            this.targetPosition.set(1, 0, 0);
            this.targetQuaternion.setFromEuler(
                new THREE.Euler( 0, Math.PI * 0.5, 0));
            break;
        case 'posY':
            this.targetPosition.set(0, 1, 0 );
            this.targetQuaternion.setFromEuler(
                new THREE.Euler( - Math.PI * 0.5, 0, 0));
            break;
        case 'posZ':
            this.targetPosition.set(0, 0, 1);
            this.targetQuaternion.setFromEuler(new THREE.Euler());
            break;
        case 'negX':
            this.targetPosition.set(-1, 0, 0);
            this.targetQuaternion.setFromEuler(
                new THREE.Euler(0, - Math.PI * 0.5, 0));
            break;
        case 'negY':
            this.targetPosition.set(0, -1, 0);
            this.targetQuaternion.setFromEuler(
                new THREE.Euler(Math.PI * 0.5, 0, 0 ));
            break;
        case 'negZ':
            this.targetPosition.set(0, 0, -1);
            this.targetQuaternion.setFromEuler(
                new THREE.Euler(0, Math.PI, 0));
            break;
        case 'xyPlane':
            this.targetPosition.set(0, 0, 1);
            this.targetQuaternion.setFromEuler(
                new THREE.Euler(0, 0, 0));
            break;
        case 'xzPlane':
            this.targetPosition.set(0, 1, 0);
            this.targetQuaternion.setFromEuler(
                new THREE.Euler(-Math.PI*0.5, 0));
            break;
        default:
            console.error('ViewHelper: Invalid axis.');
        }


        this.radius = this.editor.camera.position.distanceTo(focusPoint);
        this.targetPosition.multiplyScalar( this.radius ).add(focusPoint);

        const dummy = new THREE.Object3D();
        dummy.position.copy(focusPoint);

        dummy.lookAt(this.editor.camera.position);
        this.q1.copy(dummy.quaternion);

        dummy.lookAt(this.targetPosition);
        this.q2.copy(dummy.quaternion);


        this.deltaT = 0;
        requestAnimationFrame(this.update.bind(this));

    }

    #getAxisMaterial(color) {
        return new THREE.MeshBasicMaterial({color});
    }

    #getSpriteMaterial( color, text = null ) {
        const canvas = document.createElement( 'canvas' );
        canvas.width = 64;
        canvas.height = 64;

        const context = canvas.getContext( '2d' );
        context.beginPath();
        context.arc( 32, 32, 16, 0, 2 * Math.PI );
        context.closePath();
        context.fillStyle = color.getStyle();
        context.fill();

        if ( text !== null ) {
            context.font = '24px Arial';
            context.textAlign = 'center';
            context.fillStyle = '#000000';
            context.fillText( text.toUpperCase(), 32, 41 );
        }

        const texture = new THREE.CanvasTexture( canvas );

        return new THREE.SpriteMaterial({ map: texture});
    }
}

ViewHelper.prototype.isViewHelper = true;