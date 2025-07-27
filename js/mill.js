/**
 * @author Filipe Caixeta / http://filipecaixeta.com.br/
 */

CWS.Mill = function (options)
    {
        options = options || {};
        CWS.Machine.call( this, options );

        this.tool = this.machine.tool;

        this.canvas = null;
        this.gl = null;
        this.debug = false;
        this.mtype="Mill";

        this.initWebGL();
        this.initGeometry2D();
        this.initGeometry3D();
        this.create2DWorkpieceLimits();
    }

CWS.Mill.prototype = Object.create( CWS.Machine.prototype );

CWS.Mill.prototype.constructor = CWS.Mill;

CWS.Mill.prototype.initWebGL = function ()
    {
        // For 3D drawing
        this.canvas =  document.createElement('canvas');
        this.canvas.style.zIndex ="1000000000";
        this.canvas.style.position = "absolute";
        this.canvas.style.background = "#f0f0f0";
        if (this.debug)
            document.body.appendChild(this.canvas); // For debugging
        var attributes =
        {
            alpha: true,
            depth: true,
            stencil: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
        };
        this.gl=this.canvas.getContext( 'webgl', attributes ) || this.canvas.getContext( 'experimental-webgl', attributes);
        if ( this.gl === null )
            throw 'Error creating WebGL context.';
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
        this.gl.clearDepth(1.0);                 // Clear everything
        this.gl.enable(this.gl.DEPTH_TEST);      // Enable depth testing
        this.gl.depthFunc(this.gl.LEQUAL);       // Near things obscure far things

        this.shaderProgram1 = this.createProgram(this.gl, CWS.SHADER["vs-mill-1-3D"], CWS.SHADER["fs-mill-1-3D"]);
        this.gl.useProgram(this.shaderProgram1);
        this.shaderProgram1.dimensions = this.gl.getUniformLocation(this.shaderProgram1, "dimensions");
        this.shaderProgram1.resolution = this.gl.getUniformLocation(this.shaderProgram1, "resolution");
        this.shaderProgram1.currentDimension = this.gl.getUniformLocation(this.shaderProgram1, "currentDimension");
        this.shaderProgram1.toolRadius = this.gl.getUniformLocation(this.shaderProgram1, "toolRadius");
        this.shaderProgram1.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram1, "position");

        this.shaderProgram2 = this.createProgram(this.gl, CWS.SHADER["vs-mill-2-3D"], CWS.SHADER["fs-mill-2-3D"]);
        this.gl.useProgram(this.shaderProgram2);
        this.shaderProgram2.dimensions = this.gl.getUniformLocation(this.shaderProgram2, "dimensions");
        this.shaderProgram2.currentDimension = this.gl.getUniformLocation(this.shaderProgram2, "currentDimension");
        this.shaderProgram2.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram2, "position");
        this.shaderProgram2.texcoordAttribute = this.gl.getAttribLocation(this.shaderProgram2, "texcoord");

        this.setRendererResolution();

        this.gl.lineWidth(1);

        this.gl.clearColor(0.0,0.0,0.0,0.0);
    };

CWS.Mill.prototype.initGeometry3D = function ()
    {
        this.material3D.shading = THREE.FlatShading;
        var tempDim = Math.max(this.workpiece.x,this.workpiece.y)+this.tool.radius*2;
        this.renderDimensions = new THREE.Vector3(tempDim,tempDim,this.workpiece.z);
        var minX = Math.round(this.tool.radius*this.renderResolution/this.renderDimensions.x);
        var minY = Math.round(this.tool.radius*this.renderResolution/this.renderDimensions.y);
        var maxX = Math.round((parseFloat(this.workpiece.x)+this.tool.radius)*this.renderResolution/this.renderDimensions.x);
        var maxY = Math.round((parseFloat(this.workpiece.y)+this.tool.radius)*this.renderResolution/this.renderDimensions.y);

        var geometry = new THREE.PlaneBufferGeometry( this.workpiece.x, this.workpiece.y,
                            maxX-minX+1, maxY-minY+1 );
            geometry.dim = {x:maxX-minX+2,y:maxY-minY+2};
            geometry.dynamic = true;
            if ( geometry.attributes.normal === undefined )
            {
                geometry.addAttribute( 'normal', new THREE.BufferAttribute( new Float32Array( geometry.attributes.position.array.length ), 3 ) );
            }
            geometry.attributes.position.dynamic = true;
            geometry.attributes.normal.dynamic = true;
            geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0),99999);

        var positions = geometry.attributes.position.array;

        var xDist = this.renderDimensions.x/65535.0;
        var yDist = this.renderDimensions.y/65535.0;
        var zDist = this.renderDimensions.z/65535.0;
        var rowSize = (maxX-minX+2);
        yi = 0;
        for (var xi=0; xi<(maxX-minX+2); xi++)
        {
            var arrayPos2 = (yi*rowSize+xi)*3;
            positions[arrayPos2+0] = (xi/(xi+2)*xi)/(this.renderResolution-1)*this.renderDimensions.x;
            positions[arrayPos2+1] = (yi/(yi+2)*yi)/(this.renderResolution-1)*this.renderDimensions.y;
            positions[arrayPos2+2] = 0;
        }
        yi = maxY-minY+1;
        for (var xi=0; xi<(maxX-minX+2); xi++)
        {
            var arrayPos2 = (yi*rowSize+xi)*3;
            positions[arrayPos2+0] = (xi/(xi+2)*xi)/(this.renderResolution-1)*this.renderDimensions.x;
            positions[arrayPos2+1] = (yi/(yi+2)*yi)/(this.renderResolution-1)*this.renderDimensions.y;
            positions[arrayPos2+2] = 0;
        }
        xi = 0;
        for (var yi=0; yi<(maxY-minY+2); yi++)
        {
            var arrayPos2 = (yi*rowSize+xi)*3;
            positions[arrayPos2+0] = (xi/(xi+2)*xi)/(this.renderResolution-1)*this.renderDimensions.x;
            positions[arrayPos2+1] = (yi/(yi+2)*yi)/(this.renderResolution-1)*this.renderDimensions.y;
            positions[arrayPos2+2] = 0;
        }
        xi = maxX-minX+1;
        for (var yi=0; yi<(maxY-minY+2); yi++)
        {
            var arrayPos2 = (yi*rowSize+xi)*3;
            positions[arrayPos2+0] = (xi/(xi+2)*xi)/(this.renderResolution-1)*this.renderDimensions.x;
            positions[arrayPos2+1] = (yi/(yi+2)*yi)/(this.renderResolution-1)*this.renderDimensions.y;
            positions[arrayPos2+2] = 0;
        }
        var mesh = new THREE.Mesh( geometry, this.material3D);
            mesh.name="3DWorkpiece";
        mesh.position.x = -this.workpiece.x/2;
        mesh.position.y = -this.workpiece.y/2;
        mesh.position.z = -this.workpiece.z/2;
        this.mesh3D = mesh;
    };

CWS.Mill.prototype.initGeometry2D = function ()
    {
        var geometry = new THREE.BufferGeometry();
        geometry.boundingSphere = new THREE.Sphere( new THREE.Vector3(0,0,0),99999);
        geometry.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array([0,0,0,0,0,0]) ,3));
        geometry.addAttribute( 'vcolor', new THREE.BufferAttribute( new Float32Array([0,0]) ,1 ));
        geometry.attributes.position.dynamic = true;
        geometry.attributes.vcolor.dynamic = true;
        geometry.setDrawRange(0,Infinity);
        var mesh = new THREE.LineSegments( geometry, this.material2D );
        mesh.name = "2DWorkpiece";
        mesh.position.x = -this.workpiece.x/2;
        mesh.position.y = -this.workpiece.y/2;
        mesh.position.z = -this.workpiece.z/2;
        this.mesh2D = mesh;
    };

CWS.Mill.prototype.create2DWorkpieceLimits = function ()
    {
        if (this.meshes.meshWorkpiece === true)
            return;

        var x=this.workpiece.x;
        var y=this.workpiece.y;
        var z=this.workpiece.z;
        var geometry = new THREE.Geometry();
        geometry.vertices.push(
            new THREE.Vector3(x*0,y*0,z*0),new THREE.Vector3(x*1,y*0,z*0),
            new THREE.Vector3(x*1,y*0,z*0),new THREE.Vector3(x*1,y*0,z*1),
            new THREE.Vector3(x*1,y*0,z*1),new THREE.Vector3(x*0,y*0,z*1),
            new THREE.Vector3(x*0,y*0,z*1),new THREE.Vector3(x*0,y*0,z*0),
            new THREE.Vector3(x*0,y*0,z*0),new THREE.Vector3(x*0,y*1,z*0),
            new THREE.Vector3(x*0,y*0,z*1),new THREE.Vector3(x*0,y*1,z*1),
            new THREE.Vector3(x*1,y*0,z*1),new THREE.Vector3(x*1,y*1,z*1),
            new THREE.Vector3(x*1,y*0,z*0),new THREE.Vector3(x*1,y*1,z*0),
            new THREE.Vector3(x*0,y*1,z*0),new THREE.Vector3(x*1,y*1,z*0),
            new THREE.Vector3(x*1,y*1,z*0),new THREE.Vector3(x*1,y*1,z*1),
            new THREE.Vector3(x*1,y*1,z*1),new THREE.Vector3(x*0,y*1,z*1),
            new THREE.Vector3(x*0,y*1,z*1),new THREE.Vector3(x*0,y*1,z*0));
        geometry.computeLineDistances();

        var material = new THREE.LineDashedMaterial( { color: 0x000000, dashSize: 2, gapSize: 1 } );

        var mesh = new THREE.Line( geometry, material );
        mesh.name="2DWorkpieceDash";
        mesh.position.x = -this.workpiece.x/2;
        mesh.position.y = -this.workpiece.y/2;
        mesh.position.z = -this.workpiece.z/2;

        mesh.visible = true;

        this.meshes.meshWorkpiece = true;
        this.meshWorkpiece = mesh;
    };

CWS.Mill.prototype.updateWorkpieceDimensions = function ()
    {
        this.meshes.mesh3D = false;
        this.meshes.meshWorkpiece = false;
        this.create3DWorkpiece();
        this.create2DWorkpieceLimits();
    }

CWS.Mill.prototype.updateTool = function ()
    {
        // this.initGeometry3D();
        this.meshes.mesh3D = false;
        this.create3DWorkpiece();
    }

CWS.Mill.prototype.updateRendererResolution = function ()
    {
        // TRETA AQUI
        // CONSERTAR ISSO DEPOIS
        this.initMesh();
    }

CWS.Mill.prototype.createToolTexture = function (dim,ang)
    {
        var imgData = new Uint8Array(dim*dim*4);
        function distance(cx,cy,x,y)
        {
            return Math.sqrt(Math.pow(cx-x,2)+Math.pow(cy-y,2));
        }
        var cx=dim/2;
        var cy=dim/2;
        var radius=dim/2;
        var pos=0;
        var angTan = Math.tan(ang*Math.PI/180);
        for (var x=0; x<dim; x++)
        {
            for (var y=0; y<dim; y++)
            {
                var d = distance(cx,cy,x,y)/radius;
                if (d>1)
                {
                    imgData[pos++]=0;
                    imgData[pos++]=0;
                    imgData[pos++]=0;
                    imgData[pos++]=0;
                }
                else
                {
                    var v = d*255*angTan;
                    imgData[pos++]=v;
                    imgData[pos++]=0;
                    imgData[pos++]=0;
                    imgData[pos++]=255;
                }
            }
        }

        var texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, dim, dim, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, imgData);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        // this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        // this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        return texture;
    };

CWS.Mill.prototype.setRendererResolution = function (renderResolution)
    {
        this.renderResolution = renderResolution || this.renderResolution;
        this.pixels1 = new Uint8Array(this.renderResolution*this.renderResolution*4);
        this.pixels2 = new Uint8Array(this.renderResolution*this.renderResolution*4);
        this.canvas.width  = this.renderResolution;
        this.canvas.height = this.renderResolution;
        this.canvas.style.width  = this.renderResolution;
        this.canvas.style.height = this.renderResolution;
        this.gl.viewportWidth = this.renderResolution;
        this.gl.viewportHeight = this.renderResolution;
        this.gl.viewport(0, 0, this.gl.viewportWidth, this.gl.viewportHeight);
    };

CWS.Mill.prototype.createBuffer = function(oldBuffer,data,itemSize,attribute)
    {
        if (this.linesVertexPositionBuffer!=undefined)
            {
                try
                {
                    gl.deleteBuffer(oldBuffer);
                }catch(e)
                {
                }
            }
            var buffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
            buffer.itemSize = itemSize;
            buffer.numItems = data.length/itemSize;
            this.gl.enableVertexAttribArray(attribute);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            this.gl.vertexAttribPointer(attribute, buffer.itemSize, this.gl.FLOAT, false, 0, 0);

            return buffer;
    };

CWS.Mill.prototype.draw = function(numItems,options,pixels)
    {
        options = options || {};
        this.gl.clear(this.gl.DEPTH_BUFFER_BIT | this.gl.COLOR_BUFFER_BIT );
        if (options.LINE_STRIP==true)
            this.gl.drawArrays(this.gl.LINE_STRIP, 0, numItems);
        if (options.POINTS==true)
            this.gl.drawArrays(this.gl.POINTS, 0, numItems);
        if (options.TRIANGLES==true)
            this.gl.drawArrays(this.gl.TRIANGLES, 0, numItems);
        this.gl.flush();
        this.gl.readPixels( 0, 0, this.renderResolution, this.renderResolution,this.gl.RGBA,this.gl.UNSIGNED_BYTE, pixels);
    };

CWS.Mill.prototype.calculatePositionAndTexture = function(dimensions,toolRadius)
    {
        var xDist = (this.renderDimensions.x+1)/65535.0;
        var yDist = (this.renderDimensions.y+1)/65535.0;
        var zDist = (this.renderDimensions.z+1)/65535.0;
        var dataview1 = new DataView( this.pixels1.buffer, 0 );
        var dataview2 = new DataView( this.pixels2.buffer, 0 );
        var positions = [];
        var l=this.pixels1.length-4;
        for (var i=0; i<dataview2.byteLength; i+=4)
        {
            if (dataview2.getUint8(i+2)!==0)
            {
                var x = dataview1.getUint16(i)*xDist;
                var y = dataview1.getUint16(i+2)*yDist;
                var z = dataview2.getUint16(i);
                positions.push(  x+toolRadius, y+toolRadius, z,
                                 x-toolRadius, y+toolRadius, z,
                                 x-toolRadius, y-toolRadius, z,

                                 x+toolRadius, y+toolRadius, z,
                                 x-toolRadius, y-toolRadius, z,
                                 x+toolRadius, y-toolRadius, z);
            }
        }
        positions = new Float32Array(positions);

        texturePos = new Float32Array(positions.length/3*2);
        for (var i=0; i<texturePos.length; i+=12)
        {
            texturePos[i+ 0] = 1;
            texturePos[i+ 1] = 1;
            texturePos[i+ 2] = -1;
            texturePos[i+ 3] = 1;
            texturePos[i+ 4] = -1;
            texturePos[i+ 5] = -1;

            texturePos[i+ 6] = 1;
            texturePos[i+ 7] = 1;
            texturePos[i+ 8] = -1;
            texturePos[i+ 9] = -1;
            texturePos[i+10] = 1;
            texturePos[i+11] = -1;
        }
        return [positions,texturePos];
    };

CWS.Mill.prototype._create3DWorkpiece = function ()
    {
        // this.toolTexture = this.createToolTexture(32,this.tool.angle);
        var dimensions = this.workpiece;

        this.gl.useProgram(this.shaderProgram1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.linesVertexPositionBuffer = this.createBuffer(  this.linesVertexPositionBuffer,this.motionData.positions,3,
                                                        this.shaderProgram2.vertexPositionAttribute);
        this.gl.uniform3f(this.shaderProgram1.dimensions, this.renderDimensions.x,this.renderDimensions.y,this.renderDimensions.z);
        this.gl.uniform1f(this.shaderProgram1.resolution, this.renderResolution);
        this.gl.uniform1f(this.shaderProgram1.toolRadius, this.tool.radius);
        this.gl.uniform1i(this.shaderProgram1.currentDimension, 0);
        this.draw(this.linesVertexPositionBuffer.numItems,{LINE_STRIP:true,POINTS:true},this.pixels1);
        this.gl.uniform1i(this.shaderProgram1.currentDimension, 1);
        this.draw(this.linesVertexPositionBuffer.numItems,{LINE_STRIP:true,POINTS:true},this.pixels2);

        data = this.calculatePositionAndTexture(dimensions,this.tool.radius);
        positions = data[0];
        texturePos = data[1];

        this.gl.useProgram(this.shaderProgram2);
        this.linesVertexPositionBuffer = this.createBuffer(  this.linesVertexPositionBuffer,positions,3,
                                                        this.shaderProgram2.vertexPositionAttribute);
        this.texcoordBuffer = this.createBuffer( this.texcoordBuffer,texturePos,2,
                                            this.shaderProgram2.texcoordAttribute);

        this.gl.uniform3f(this.shaderProgram2.dimensions, this.renderDimensions.x,this.renderDimensions.y,this.renderDimensions.z);
        this.gl.uniform1i(this.shaderProgram2.currentDimension, 0);
        this.draw(this.linesVertexPositionBuffer.numItems,{TRIANGLES:true},this.pixels1);
        this.gl.uniform1i(this.shaderProgram2.currentDimension, 1);
        this.draw(this.linesVertexPositionBuffer.numItems,{TRIANGLES:true},this.pixels2);

        var geometry  = this.mesh3D.geometry;
        var positions = geometry.attributes.position.array;

        var xDist = this.renderDimensions.x/65535.0;
        var yDist = this.renderDimensions.y/65535.0;
        var zDist = this.renderDimensions.z/65535.0;
        var dataview1 = new DataView( this.pixels1.buffer, 0 );
        var dataview2 = new DataView( this.pixels2.buffer, 0 );
        var i=0;
        var minX = Math.round(this.tool.radius*this.renderResolution/this.renderDimensions.x);
        var minY = Math.round(this.tool.radius*this.renderResolution/this.renderDimensions.y);
        var maxX = Math.round((parseFloat(this.workpiece.x)+this.tool.radius)*this.renderResolution/this.renderDimensions.x);
        var maxY = Math.round((parseFloat(this.workpiece.y)+this.tool.radius)*this.renderResolution/this.renderDimensions.y);

        var rowSize = (maxX-minX+2);
        for (var yi=minY; yi<maxY; yi++)
        {
            for (var xi=minX; xi<maxX; xi++)
            {
                var arrayPos1 = (yi*this.renderResolution+xi)*4;
                var arrayPos2 = ((yi-minY+1)*rowSize+xi-minX+1)*3;
                if (dataview2.getUint8(arrayPos1+3)!==0)
                {
                    var x = dataview1.getUint16(arrayPos1)*xDist;
                    var y = dataview1.getUint16(arrayPos1+2)*yDist;
                    var z = this.renderDimensions.z-dataview2.getUint16(arrayPos1)*zDist;
                    positions[arrayPos2+0] = (xi-minX)/(this.renderResolution-1)*this.renderDimensions.x;
                    positions[arrayPos2+1] = (yi-minY)/(this.renderResolution-1)*this.renderDimensions.y;
                    positions[arrayPos2+2] = z;
                }
                else
                {
                    positions[arrayPos2+0] = (xi-minX)/(this.renderResolution-1)*this.renderDimensions.x;
                    positions[arrayPos2+1] = (yi-minY)/(this.renderResolution-1)*this.renderDimensions.y;
                    positions[arrayPos2+2] = this.renderDimensions.z;
                }
            }
        }

         var index = geometry.index;
         var attributes = geometry.attributes;
         var groups = geometry.groups;

         var positions = attributes.position.array;
         var array = attributes.normal.array;

         for ( var i = 0, il = array.length; i < il; i ++ )
         {
             array[i] = 0;
         }

         var normals = attributes.normal.array;
         var vA, vB, vC,

         pA = new THREE.Vector3(),
         pB = new THREE.Vector3(),
         pC = new THREE.Vector3(),

         cb = new THREE.Vector3(),
         ab = new THREE.Vector3();

         var indices = index.array;
         if ( groups.length === 0 )
         {
             geometry.addGroup( 0, indices.length );
         }
         for ( var j = 0, jl = groups.length; j < jl; ++ j )
         {
             var group = groups[ j ];
             var start = group.start;
             var count = group.count;

             for ( var i = start, il = start + count; i < il; i += 3 )
             {
                 vA = indices[ i + 0 ] * 3;
                 vB = indices[ i + 1 ] * 3;
                 vC = indices[ i + 2 ] * 3;

                 pA.fromArray( positions, vA );
                 pB.fromArray( positions, vB );
                 pC.fromArray( positions, vC );

                 cb.subVectors( pC, pB );
                 ab.subVectors( pA, pB );
                 cb.cross( ab );

                 normals[ vA ] += cb.x;
                 normals[ vA + 1 ] += cb.y;
                 normals[ vA + 2 ] += cb.z;

                 normals[ vB ] += cb.x;
                 normals[ vB + 1 ] += cb.y;
                 normals[ vB + 2 ] += cb.z;

                 normals[ vC ] += cb.x;
                 normals[ vC + 1 ] += cb.y;
                 normals[ vC + 2 ] += cb.z;
             }
         }

         var x, y, z, n;
         for ( var i = 0, il = normals.length; i < il; i += 3 )
         {
             x = normals[ i ];
             y = normals[ i + 1 ];
             z = normals[ i + 2 ];
             n = 1.0 / Math.sqrt( x * x + y * y + z * z );
             normals[ i ] *= n;
             normals[ i + 1 ] *= n;
             normals[ i + 2 ] *= n;
         }

        attributes.position.needsUpdate = true;
        attributes.normal.needsUpdate = true;

        this.mesh3D.position.x = -this.workpiece.x/2;
        this.mesh3D.position.y = -this.workpiece.y/2;
        this.mesh3D.position.z = -this.workpiece.z/2;
    };

// a point is less than the smaller xy it has
CWS.Mill.prototype.pntLT_XY = function(pnt1, pnt2)
    {
        return pnt1.x * pnt1.y <  pnt2.x * pnt2.y;
    }

CWS.Mill.prototype.pntEQ_XY = function(pnt1, pnt2)
    {
        return pnt1.x * pnt1.y ===  pnt2.x * pnt2.y;
    }

CWS.Mill.prototype.pntLTEQ_XY = function(pnt1, pnt2)
    {
        return pnt1.x * pnt1.y ===  pnt2.x * pnt2.y;
    }

CWS.Mill.prototype.lineDetect = function()
    {
        /**
         * Find the point which has gone further the most.
         * As it is i 3d not 4 or 5D we only need to find the depth
         */
        // contains all vertexes (points) with deepest cuts (smallest z)
        // (same coordinates but at a shallower depth are removed in paths)
        const paths = this.getPaths();
        this.lineAngles(paths); // create lines, agles of them
        this.toolRadius(paths); // Draw tool outset

        // create a geometry inverted, sort of plane to cut out of workpiece
        this.createCutoutPlane(paths, boundingBox);

    }

CWS.Mill.prototype.getPaths = function ()
    {
        const paths = []
        let curPath = {}, newPath = true, prevXY = "";
        const left  =  -this.workpiece.width/2 + this.machineOffset.x + this.toolRadius,
              right =   this.workpiece.width/2 + this.machineOffset.x + this.toolRadius,
              top   =   this.workpiece.height/2 + this.machineOffset.y + this.toolRadius,
              bottom = -this.workpiece.height/2 + this.machineOffset.y + this.toolRadius,
              upper  = this.workpiece.z/2 + this.machineOffset.z,
              lower  = -this.workpiece.z/2 + this.machineOffset.z;

        // to find the bounding Box of our cuts
        let maxX = left, minX = right, maxY = bottom, minY= top, minZ=upper, idx = 0;

        for (let i = 0, end = this.motionData.length; i < end;){
            const pnt = {
                x:this.motionData[i++],
                y:this.motionData[i++],
                z:this.motionData[i++]
            }

            if (pnt.x >= left && pnt.x <= right &&
                pnt.y >= bottom && pnt.y <= top)
            {
                // inside of workpiece in X,y axis including tool radius
                const xy = pnt.x + "," + pnt.y; // hash tables are much faster than arrays
                                                // objects are hashtables internally in js

                if (pnt.z > upper) {
                    if (curPath.length) {
                        paths.push(curPath); // begin a new path on next run
                        curPath.exitPnt = curPath[prevXY];
                        curPath = {};
                        newPath = true;
                    }
                } else if (newPath) {
                    newPath = false;   // entering workpisce again
                    curPath[xy] = {x:pnt.x, y:pnt.y, z:pnt.z, idx};
                    curPath.entryPnt = curPath[xy];
                } else if (xy in curPath) {
                    if (curPath[xy].z > pnt.z) {
                        curPath[xz].z = pnt.z;
                        curPath[xz].idx = idx; // position motiondata
                    }
                } else
                    curPath[xy] = {x:pnt.x, y:pnt.y, z:pnt.z, idx:i};

                minY = Math.min(minY, pnt.y);
                maxY = Math.max(minY, pnt.y);
                minX = Math.min(minX, pnt.x);
                maxX = Math.max(minX, pnt.x);
                minZ = Math.min(minZ, pnt.z);

                prevXY = xy;
            }

            ++idx;
        }

        if (!newPath) // possible that program hasnt gone home when it ends.
            paths.push(curPath);

        // we should now have paths containing the deepest cut in every in each XY position
        paths.bBox = {
            x1: minX - this.toolRadius,
            y1: minY - this.toolRadius,
            x2: maxX + this.toolRadius*2,
            y2: maxY + this.toolRadius*2,
            z: minZ
        };
        return paths;
    }

// add lines and calulates their angles relative to workpiece xyz
CWS.Mill.prototype.lineAngles = function(paths, bBox)
    {
        // create vertexes out of paths,
        // when we have 2 lines we can determine the angle
        // we need the angle to determine where the cutout radius should go.

        //
        // each line segment has 3 angles i,j,k
        for (const path of paths) {
            path.lines = [];
            let minY = bBox.maxY, maxY = bBox.minY,
                minX = bBox.maxX, maxX = bBox.minX,
                minZ = 0;

            path.lowerLeft = path.lines[0].p1; // as in moste lower left corner

            let prev = path.entryPnt;
            for (const vert of Object.values(path)) {
                if (vert.x!==prev.x || vert.y !== prev.y || vert.z !== prev.z) {
                    // calculate angles for each line (edge) Relative to world xyz.
                    // we don't need 3rd axis angles as we use a 3axis mill,
                    // can only cut vertically, can't move 4 or 5 axis
                    // sort pnts in left-lower order
                    const rev = this.pntLT_XY(vert, prev);
                    const sw = rev ? vert : prev, // southwest/north east in xy plane
                          ne = rev ? prev : vert;

                    const line = {
                        p1: sw, p2: ne,
                        i: Math.atan2(sw.x, ne.x),
                        j: Math.atan2(sw.j, ne.j),
                        z: Math.atan2(sw.z, ne.z),
                    };
                    // push pnts them in sorted order
                    if (this.lessEQ(vert, prev)) {
                        line.p1 = prev;
                        line.p2 = vert;
                    } else {
                        line.p1 = vert;
                        line.p2 = prev;
                    }
                    path.lines.push(line);
                }

                minY = Math.min(minY, pnt.y);
                maxY = Math.max(minY, pnt.y);
                minX = Math.min(minX, pnt.x);
                maxX = Math.max(minX, pnt.x);
                minZ = Math.min(minZ, pnt.z);

                // store left-lower most pnt to start creating vertexes from
                if (this.pntLT_XY(path.lowerLeft, line.p1))
                    path.lowerLeft = line.p1;

                prev = vert;
            }
            path.bBox = {minX, minY, maxX, maxY, minZ};
        }
    }

// tool outset
CWS.Mill.prototype.toolOffset = function(paths)
    {
        // we should create a line on left and right side of line with
        // tool radius and draw an arc in between
        // pnts move toolradius away and translated with angle, we only
        // work in xy plane so get away from more complex stuff (hopefully)
        //    +
        //  +  \     here centerline is our path,
        //+  \  \     right moves in y: toolradius * cos(line angle)
        // \  \  +    right moves in x: toolradius * sin(line angle)
        //  \  +      invert for left line
        //   +

        const vertexes = []; // should optimse later when i got it working
        const angleIncr = this.renderResolution / (2*this.toolRadius*Math.PI);
        const toolDia = this.toolRadius * 2;
        const piHalf = Math.PI/2;

        const createArc = (center, startAngle, endAngle, line) => {
            line.arc = [];
            let a = startAngle + angleIncr;
            for (l;a < endAngle; a += angleIncr)
                line.arc.push({x:center.x*Math.cos(a),
                               y:center.y*Math.sin(a),
                               z:center.z})
        }

        /// x, y as in diff to toolRadius
        const movePnt = (pnt, xDiff, yDiff) => {
            pnt.x += this.toolRadius - xDiff;
            pnt.y += this.toolRadius - yDiff;
        }

        /// If pnts intersects within toolradius circle
        const isIntersecting = (pnt1, pnt2) => {
            const xDiff = pnt2.x - pnt1.x,
                  yDiff = pnt2.y - pnt1.y;
            return (Math.abs(xDiff) < toolDia && Math.abs(yDiff) < toolDia);
        }

        // intersects as in XY plane within toolRadius circle
        // returns the lower point as we always turn clockwise when drawing arcs
        const interectPntXY = (pnt1, pnt2) => {
            const xDiff = pnt2.x - pnt1.x,
                  yDiff = pnt2.y - pnt1.y;
            if (Math.abs(xDiff) < toolDia &&
                Math.abs(yDiff) < toolDia)
            {
                const angle = Math.atan2(yDiff, xDiff);
                const hypo = Math.sqrt(Math.pow(xDiff,2) + Math.pow(yDiff,2));
                const intrusion = toolDia - hypo; // as in intrusion into pnt1 circle
                const x = pnt1.x + intrusion * Math.cos(angle),
                      y = pnt1.y + intrusion * Math.sin(angle);
                return {x, y};
            }
            return null;
        }

        const upper = this.workpiece.z/2+this.machineOffset,
              under = -this.workpiece.z/2+this.machineOffset;

        for (const path of paths) {
            let prev = null;
            for (const line of path.line) {
                const rY = Math.cos(line.i) * this.toolRadius,
                      rX = Math.sin(line.i) * this.toolRadius,
                      // z might be below bottom face
                      z = Math.max(line.p1.z, under);

                // we might not always have a mirror in uppper surface,
                // when we curve in z surface or have steps
                line.p1r = {x:line.p1.x+rX, y:line.p1+rY, z},
                line.p2r = {x:line.p2.x+rX, y:line.p1+rY, z},
                line.p1l = {x:line.p1.x-rX, y:line.p1-rY, z},
                line.p2l = {x:line.p1.x-rX, y:line.p1-rY, z};

                if (!line.p1 !== path.entryPnt && !line.p2 != path.exitPnt) {
                    // calculate difference to previous line, draw arc
                    const diffAngle = line.i - prev.i;
                    if (diffAngle < 0) { // right turn, arc on left
                        // shorten right
                        movePnt(line.p1r, rX, rY);
                        movePnt(prev.p2r, rX, rY);
                        createArc(p1, prev.i + piHalf, line.i + piHalf);

                    } else if (diffAngle > 0) { // left turn, arc on the right
                        // shorten left
                        movePnt(line.p1l, rX, rY);
                        movePnt(prev.p2l, rX, rY);
                        createArc(p1, prev.i - piHalf, line.i - piHalf);
                    }
                }

                prev = line;
            }

            // handle entry and exit arcs
            const entLine = path.lines[0],
                  exitLine = path.lines[path.lines.length-1];
            let entStAngle = entLine.i + piHalf*3,
                entEnAngle = entLine.i + piHalf,
                extStAngle = exitLine + piHalf*3,
                extEnAngle = exitLine + piHalf;

            const intPnt = interectPntXY(path.entryPnt, path.exitPnt);
            if (intPnt) {
                // truncated arcs as they intersect
                entStAngle = Math.atan2(intPnt.y-path.entryPnt.y,
                                        intPnt.x-path.entryPnt.x);
                extEnAngle = Math.atan2(intPnt.y-path.exitPnt.y,
                                        intPnt.x-path.exitPnt.x);
            }

            // draw arc at path ends
            createArc(path.exitPnt, extStAngle, extEnAngle, exitLine);
            createArc(path.entryPnt, entStAngle, entEnAngle, entLine);
        }
    }

CWS.Mill.prototype.linesToVertexes = function(paths)
    {

    }

CWS.Mill.prototype.createCutOutMeshes = function(paths)
    {
        // create lines out of paths, add 2 (each side)
        // when we have 2 lines we can determine the angle
        // we need the angle to determine where the cutout radius should go.

        for (const path of paths) {
            //const positions = new Float32Array( * 3); // xyz for each vertex

        }








        // for (let x = boundingBox.x1, endX = boundingBox.x2 +x;
        //     x < endX; ++x)
        // {
        //     for (let y = boundingBox.y1, endY = boundingBox.y2 + y;
        //          y < endY; ++y)
        //     {

        //     }
        // }
    }