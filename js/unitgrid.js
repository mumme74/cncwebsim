// @author Fredrik Johansson github.com/mumme74

class UnitGrid extends THREE.LineSegments
{
	constructor(inInches = false, size = 500, yUp = false) {

        const colorTable = {
            xAxis:  new THREE.Color("#ff0000"),
            yAxis:  new THREE.Color("#00ff00"),
			zAxis:  new THREE.Color("#0000ff"),
            div:    new THREE.Color("#444444"),
            subDiv: new THREE.Color("#b8b3b3")
        }

        // use 1/16" for smallest unit for inches
        const baseUnit     = inInches ? 25.4 / 16 : 1;
        const divSize      = inInches ? 16 : 10;
        const subDivisions = Math.floor(size / baseUnit);

		const center   = subDivisions / 2;
        const subStep  = size / subDivisions;
		const halfSize = size / 2;

		var geometry = new THREE.Geometry();

		const pushLines = (coord, colorHor, colorVer)=>{
			geometry.vertices.push(
				new THREE.Vector3(-halfSize, coord, 0),
				new THREE.Vector3(halfSize, coord, 0));
			geometry.vertices.push(
				new THREE.Vector3(coord, -halfSize, 0),
				new THREE.Vector3(coord, halfSize, 0));

			geometry.colors.push(colorHor, colorHor, colorVer, colorVer);
		}

        let colorHor, colorVer;
		for (let i = 0, j = 0, k = - halfSize;
             i <= subDivisions; i ++, k += subStep )
        {
            if (i !== center) {
				colorHor = colorVer = ((i % divSize) === 0)
                                    ? colorTable.div : colorTable.subDiv;
				pushLines(k, colorHor, colorVer);
			}
		}

		// specialcase centerAxis
		pushLines(0, colorTable.xAxis,
			      yUp ? colorTable.zAxis : colorTable.yAxis);


		const material = new THREE.LineBasicMaterial({
            vertexColors: true
        });


		if (yUp) // lathe mode, grid on XZ plane instead of XY
			geometry.rotateX(Math.PI * 0.5);

		super(geometry, material);

		this.type = 'UnitGrid';
	}

	/**
	 * Frees the GPU-related resources allocated by this instance. Call this
	 * method whenever this instance is no longer used in your app.
	 */
	dispose() {
		this.geometry.dispose();
		this.material.dispose();
	}
}
