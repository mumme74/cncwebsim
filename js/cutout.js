/**
 * @author Fredrik Johansson / github.com/mumme74
 */


/**
 * Translates milling coordinates (motiondata)
 * to a 3D geometry to cut out of a workpiece
 */
class Cutout {
    constructor(machine)
    {
        this.machine = machine;
        this.toolRadius = machine.toolRadius;
        this.workpiece = machine.workpiece;
        this.motionData = this.motionData
    }

    // a point is less than the smaller xy it has
    /**
     * If pnt1 is x*y is less than pnt2 x*y
     * @param {point} pnt1
     * @param {point} pnt2
     * @returns {boolean} True if pnt1 < pnt2
     */
    pntLT_XY = function(pnt1, pnt2)
    {
        return pnt1.x * pnt1.y <  pnt2.x * pnt2.y;
    }

    /**
     * If a point x*y  is the same as pnt2
     * @param {point} pnt1
     * @param {point} pnt2
     * @returns {boolean} True if pnt1 == pnt2
     */
    pntEQ_XY = function(pnt1, pnt2)
    {
        return pnt1.x * pnt1.y ===  pnt2.x * pnt2.y;
    }

    /**
     * If a pnt1 x*y is less or equal to pnt2
     * @param {point} pnt1
     * @param {point} pnt2
     * @returns {boolean} True if pnt1 <= pnt2
     */
    pntLTEQ_XY = function(pnt1, pnt2)
    {
        return pnt1.x * pnt1.y ===  pnt2.x * pnt2.y;
    }

    /**
     * Calculate the distance between points
     * Rather computationally intensive (1 sqroot and 2 pow)
     * bounds check with isIntersecting first, if this is needed
     * @param {point} pnt1
     * @param {point} pnt2
     * @returns {number} The distance
     */
    distanceXY = function(pnt1, pnt2)
    {
        return Math.sqrt(Math.pow(pnt2.x-pnt1.x, 2) +
                         Math.pow(pnt2.y-pnt1.y, 2));
    }

    /**
     * If pnts intersects within toolradius circle
     * @param {point} pnt1
     * @param {point} pnt2
     * @returns {boolean} if within circle
     */
    isIntersecting = function(pnt1, pnt2)
    {
        const xDiff = pnt2.x - pnt1.x,
              yDiff = pnt2.y - pnt1.y;
        return (Math.abs(xDiff) < toolDia && Math.abs(yDiff) < toolDia);
    }

    /**
     * Line intersects other line
     * original math: Paul Bourke http://paulbourke.net/geometry/pointlineplane/
     * @param {point} fence1 First point of fence line
     * @param {point} fence2 Second point of fence line
     * @param {point} pnt    The spear point of line intersecting
     * @param {point} trail  The trail point of intersecting line
     * @return {null | point} Coordinates of intersecting point or null
    */
    linesIntersect = function(fence1, fence2, pnt, trail)
    {
        // Check if none of the lines are of length 0
        if ((fence1.x === fence2.x && fence1.y === fence2.y) ||
            (pnt.x === trail.x && pnt.y === trail.y)) {
            return null;
        }

        denominator = ((trail.y - pnt.y) * (fence2.x - fence1.x)
                    - (trail.x - pnt.x) * (fence2.y - fence1.y));

        // Lines are parallel
        if (denominator === 0)
            return null;

        const ua = ( (trail.x - pnt.x) * (fence1.y - pnt.y)
                     - (trail.y - pnt.y) * (fence1.x - pnt.x))
                   / denominator;
        const ub = ( (fence2.x - fence1.x) * (fence1.y - pnt.y)
                     - (fence2.y - fence1.y) * (fence1.x - pnt.x))
                   / denominator;

        // is the intersection along the segments
        if (ua < 0 || ua > 1 || ub < 0 || ub > 1)
            return null;

        // Return a object with the x and y coordinates of the intersection
        let x = fence1.x + ua * (fence2.x - fence1.x);
        let y = fence1.y + ua * (fence2.y - fence1.y);

        return {x, y};
    }


//    /**
//     * Determines if pnt is going outside of fence line
//     * Outside defined as left of a clockwise direction
//     * @param {point} fence1 Point 1 of fence line
//     * @param {point} fence2 Point 2 of fence line
//     * @param {point} pnt The point to check against
//     * @param {point} trailPnt The pnt the training point
//     * @returns
//     */
//     outsideOfLine(fence1, fence2, pnt, trailPnt)
//     {
//         // const minx = Math.min(pnt.x, trailPnt.x),
//         //       miny = Math.min(pnt.y, trailPnt.y),
//         //       fmaxx = Math.min(fence1.x, fence2.x),
//         //       fmaxy = Math.min(fence1.y, fence2.y);

//         // // if line points are above fence max we exit early
//         // if (minx > fmaxx && miny > fmaxy)
//         //     return null;


//         // const minPnt = this.pntLTEQ_XY(pnt, trailPnt) ? pnt : trailPnt,
//         //       maxPnt = minPnt === pnt ? trailPnt : pnt,
//         //const fminPnt = this.pntLTEQ_XY(fence1, fence2),
//         //      fmaxPnt = fminPnt === fence1 ? fence2 : fence1;

//         // const iSectPnt = {
//         //     x: fmaxPnt.x - minPnt.x + fminPnt.x,
//         //     y: fmaxPnt.y - minPnt.y - fminPnt.y,
//         // };

//         // return iSectPnt;

//         if (fence1.x <= fence2.x) { // line going from left to right
//             if (fence1.y <= fence2.y) { // an upward line in dir: ↗ or →
//                 if (pnt.x > fence2.x || pnt.y < fence1.y)
//                     return null; // definietly inside of fence, happy path

//                 // might be inside of (imaginary) fence right triangle
//                 // is outside if
//                 const dstX = fence2.x - pnt.x, dstY = fence1.y - pnt.y;
//                 const fDstX = fence2.x - fence1.x, fDstY = fence2.y - fence1.y;
//                 const ap = Math.atan2(dstY, dstX),
//                       af = Math.atan2(fDstY, fDstX);
//                 if (ap <= af) // exactly on line or inside
//                     return null;

//                 // definetly outside, figure out if trail is not
//                 const dtrX = fence2.x - trailPnt.x, dtrY = fence1.y - pnt.y;
//                 const at = Math.atan2(dtrY, dtrX);
//                 const iSectPnt = (at < af) ? {x:dstX*Math.cos(af),y:dst} :null
//                 return {

//                 }


//             } else { // a downward going line in dir: ↘
//                 if (pnt.x > fence2.x || pnt.y < fence2.y)
//                     return null;

//             }

//         } else { // line going from right to left
//             if (fence1.y <= fence2.y) { // an upward line in dir: ↖ or ←
//                 if (pnt.x > fence1.x || pnt.y < fence1.y)
//                     return null;

//             } else { // a downward line in dir: ↙
//                 if (pnt.x > fence1.x || pnt.y < fence2.y)
//                     return null;

//             }

//         }
//     }

    lineDetect = function()
    {
        /**
         * Find the point which has gone further the most.
         * As it is i 3d not 4 or 5D we only need to find the depth
         */
        // contains all vertexes (points) with deepest cuts (smallest z)
        // (same coordinates but at a shallower depth are removed in paths)
        const paths = this.getPaths();
        this.pointAngle(paths); // calc angles of the pnts related to prev
        this.elimPocketDeckPnt(paths);
        this.toolRadius(paths); // Draw tool outset

        // create a geometry inverted, sort of plane to cut out of workpiece
        this.createCutoutPlane(paths, boundingBox);

    }

    getPaths = function ()
    {
        const paths = [],
              offsetX = this.machineOffset.x + this.toolRadius,
              offsetY = this.machineOffset.y + this.toolRadius;
        const left  =  -this.workpiece.width/2 + offsetX,
              right =   this.workpiece.width/2 + offsetX,
              top   =   this.workpiece.height/2 + offsetY,
              bottom = -this.workpiece.height/2 + offsetY,
              upper  = this.workpiece.z/2 + this.machineOffset.z,
              lower  = -this.workpiece.z/2 + this.machineOffset.z;

        let curPath = {}, newPath = true, prevXY = "";

        // to find the bounding Box of our cuts
        let maxX = left, minX = right,
            maxY = bottom, minY= top,
            minZ=upper, idx = 0;

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
                // hash tables are much faster than (vanilla) arrays for lookup.
                // objects in js are hashtables internally.
                const xy = pnt.x + "," + pnt.y;

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
    pointAngle = function(paths, bBox)
    {
        // create vertexes out of paths,
        // when we have 2 lines we can determine the angle
        // we need the angle to determine where the cutout radius should go.

        //
        // each line segment has 3 angles i,j,k
        for (const path of paths) {
            path.pnts = [];
            let minY = bBox.maxY, maxY = bBox.minY,
                minX = bBox.maxX, maxX = bBox.minX,
                minZ = 0;

            path.lowerLeft = path.lines[0].p1; // as in moste lower left corner

            let prev = path.entryPnt, idx = -1;
            for (const [key, pnt] of Object.entrie(path)) {
                idx++;
                if (key === 'entryPnt' || key === 'exitPnt')
                    // entry and exitPnts are convienience,
                    // are doubled with ordinary points
                    continue;

                if (pnt.x!==prev.x || pnt.y !== prev.y || pnt.z !== prev.z) {
                    // calculate angles for each pnt (vertex) Relative to prev pnt
                    // we don't need 3rd axis angles as we use a 3axis mill,
                    // can only cut vertically, can't move 4 or 5 axis
                    const yi = pnt.y-prev.y,
                          xi = pnt.x-prev.y,
                          zi = pnt.z-prev.z;

                    // Unsure if these are corect for j and k?
                    pnt.i = Math.atan2(yi, xi);
                    pnt.j = Math.atan2(zi, yi);
                    pnt.k = Math.atan2(xi, zi);

                    path.pnts.push(pnt);
                }

                minY = Math.min(minY, pnt.y);
                maxY = Math.max(minY, pnt.y);
                minX = Math.min(minX, pnt.x);
                maxX = Math.max(minX, pnt.x);
                minZ = Math.min(minZ, pnt.z);

                // store left-lower most pnt to start creating vertexes from
                if (this.pntLT_XY(path.lowerLeft, line.p1)) {
                    path.lowerLeft = line.p1;
                    path.lowerLeftIdx = idx;
                }

                prev = pnt;
            }
            // boundingbox of this path
            path.bBox = {minX, minY, maxX, maxY, minZ};
        }
    }

    elimPocketDeckPnt = function(paths)
    {
        // When in a pocket we might have several points "inside" with same z
        // that should not be part of output mesh
        // intended algorithm:
        //  try to divide this path into subpaths everytime z changes or we
        //  begin a new ring
        //  1 Start at lowerLeft corner, walk clockwise around until reachin
        //    nearest lowerLeft. (must be within toolradius to count)
        //      check for changes in z in every point
        //  2 When reaching nearest lower left
        //      Set this point as newer lowerleft.
        //      mark outer ring as not having any right edges.
        //      Start a new ring, we might pop it in stage 3.
        //      Walk around again in clockwise, check every point for intrusion
        //      into outerring lines. Don't check point to point, check line,
        //      as it might intrude on a line on the outer ring.
        //         if intrudes and passes left of line we have to split outerline
        //         with line cut in part and move this point to outer ring
        //         as long as this is left of outerline we need to move all
        //         these points to outer ring, record the point where it passes
        //         outer ring again. Splice and insert a point at this location
        //  3 When we walked around again and reached nearest lower left without
        //    any changes to z, we can eliminate that ring.
        //      Store this point as new lower left and repeat from 2.
        //      Continue until end of path or z changes.
        //  4 If Z changes we stop this ring and store it as inner ring.
        //      Store this point as new lower left (Might not actually be at
        //       lower left at this stage, but that should not matter now)
        //       startover from 1 with a new subpath
        //
        //  When exiting, we should now have an outer-ring, a possible inner-ring
        //     and possible subpaths (like terasses) where z changes.


        const createSubpath = (path, startPoint) => {
            const subPath = [];
            subPath.startPoint = startPoint; // lowerLeft in descr.
            path.subPaths.push(subPath);

            let ring   = [startPoint],
                prev   = startPoint,
                hasLeftStartCircle = false,
                prevD = 10e10,
                crossPntOuter = null;

            // start with outer ring
            subPath.rings = [ring];
            const outerRing = ring;

            // when we have completed a walk around
            const finishRing = (newStartPoint) => {
                if (subPath.rings.length > 1)
                    subPath.rings.pop(); // previous ring eliminated
                else
                    // first innerring disable innerring edge on outerring
                    outerRing.noRightEdge = false;
                ring = [newStartPoint];
                subPath.rings.push(ring);
                hasLeftStartCircle = false;
                prevD = 10e10;
                crossPntOuter = null;
            }

            // when z has changed
            const newSubPath = (newStartPoint) => {
                finishRing(newStartPoint);
                const newOuterRing = subPath.rings.pop();
                subPath = [newOuterRing];
                path.subPaths.push(subPath);
            }

            // what z is at intersectPnt
            const zPosAt = (pnt, trail, iSectPnt) => {
                if (pnt.z === trail.z)
                    return pnt.z;

                // angle from trail's perspective
                const ap = Math.atan2(pnt.z-trail.z, pnt.x-pnt.z);
                return this.distanceXY(pnt, trail)* Math.sin(ap);
            }

            const passesOuterRing = (pnt, trail, i) => {
                // find the closest 2 points on outer ring
                let up = ring.length, trailUp = outerRing[up-1], pntUp,
                    dwn = ring.length, trailDwn = outerRing[dwn-1], pntDwn,
                    iSectPnt;
                // check progressively both dir from guesspoint until found
                for (up++, dwn--; up < outerRing.length && dwn > -1; up++, dwn--) {
                    if (up < outerRing.length) {
                        pntUp = outerRing[up];
                        iSectPnt = this.linesIntersect(pntUp, trailUp, pnt, trail);
                        if (iSectPnt) {
                            iSectPnt.z = zPosAt(pnt, trail, iSectPnt);
                            return {iSectPnt, outerPos1:up, outerPos1:up-1};
                        }
                    }
                    if (dwn > -1) {
                        pntDwn = outerRing[dwn];
                        iSectPnt = this.linesIntersect(pntDwn, trailDwn, pnt, trail);
                        if (iSectPnt) {
                            iSectPnt.z = zPosAt(pnt, trail, iSectPnt);
                            return {iSectPnt,outerPos1:down, outerPos2:down+1};
                        }
                    }

                    // if we moving away further on both we are done.
                    if (this.distanceXY(pntUp) > this.distanceXY(trailUp) &&
                        this.distanceXY(pntDwn) > this.distanceXY(trailDwn)
                    )
                        return null;

                    trailUp = pntUp;
                    trailDwn = pntDwn;
                }

                return null; // not found
            }

            const spliceOuterRing = (iSectObj) => {
                const pnt1 = outerRing[iSectObj.outerPos1],
                      pnt2 = outerRing[iSectObj.outerPos2],
                      iSectPnt = iSectObj.iSectPnt;

                const ringZ = zPosAt(pnt1, pnt2, iSectPnt);

                // if we have different height we need to insert a new point
                // on outerring for iSectPnt to be vertical
                if (ringZ !== iSectPnt.z) {
                    const ringPnt = {x:iSectPnt.x, y:iSectPnt.y, ringZ};
                    outerRing.splice(iSectObj.outerPos2, 0, ringPnt, iSectPnt);
                } else
                    outerRing.splice(iSectObj.outerPos2, 0, iSectPnt);
            }

            // lowerLeft might not be at start of path we need to handle the
            // flip around seamlessly
            let i = startPoint+1, // begining at first pnt after
                end    = startPoint,
                flipAt = path.lines.length;

            while (i !== end) {
                const pnt = path.pnts[i];

                const iSectObj = passesOuterRing(pnt, path.pnts[i-1]);
                if (iSectObj) {
                    // going out sets, going in clears.
                    crossPntOuter = !crossPntOuter ? iSectObj.iSectPnt : null;
                    spliceOuterRing(iSectObj)
                }

                // maybe begin a new subpath?
                if (prev.z !== pnt.z) {
                    finishRing(pnt);
                    continue;
                }

                // detect if we are within startpoints toolradius
                if (this.isIntersecting(startPoint, pnt)) {
                    // track if we should track within tool circle of starPoint
                    if (hasLeftStartCircle) {
                        const d = this.distanceXY(startPoint, pnt);
                        if (d > prevD) {
                            finishRing(prev);
                            i--; // back one as that is the new startPoint
                        }
                    }
                } else
                    hasLeftStartCircle = true; // start tracking

                // flipping over to unaccounted at beginning
                if (++i === flipAt)
                    i = 0; // start over from beginning
            }

        }

        for (const path of paths) {
            path.subPaths = [];
            createSubpath(path, path.startPoint);
        }
    }

    // tool outset
    toolOffset = function(paths)
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

    linesToVertexes = function(paths)
    {
        // Begin on lower left point (Left line start) walk around on the
        // left edge, count all the center points. Halt when we reach path.length
        // If we are at our starting point we have finished outer perimeters
        // * If that points center the same as our
        //   startingpoint, we don't have a pocket.and we are finished:
        //   bail out
        // Else If end point not same as startingpoint we are a pocket or a circle.
        // * Repeat the with right line
        //

    }

    createCutOutMeshes = function(paths)
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
}