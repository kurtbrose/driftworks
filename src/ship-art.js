(function (global) {
  'use strict';
  // Pixi craft and platform presentation. World snapshots are read-only.
  /** @typedef {import('./types').Ship} Ship */
  /** @typedef {import('./types').Wreck} Wreck */
  /** @typedef {import('./types').World} World */
  /** @typedef {import('./types').Vec2} Vec2 */
  /** @typedef {import('./types').Asteroid} Asteroid */
  /** @typedef {import('./types').Camera} Camera */
  /** @typedef {import('./types').Viewport} Viewport */
  /** @typedef {{radius: number, fill: number, stroke: number}} ShipStyle */
  /** @typedef {{x: number, y: number, z: number}} AsteroidNormal */
  /** @typedef {{id: string, origin: Vec2, direction: Vec2, side: Vec2, length: number, width: number, alpha: number}} Plume */
  /** @type {import('./types').DriftworksNamespace} */
  var Driftworks = global.Driftworks;
  var sim = /** @type {import('./types').SimApi} */ (Driftworks.sim);
  var PIXI = global.PIXI;
  var asteroidArt = Driftworks.asteroidArt;
  if (!asteroidArt) throw new Error('Shared asteroid artwork module did not load.');
  var asteroidReliefAt = asteroidArt.reliefAt;
  var WORLD_LIGHT = asteroidArt.light;

  var DETAIL_ZOOM_START = 32;

  /** @type {Record<string, ShipStyle>} */
  var SHIP_STYLES = {
    mothership: { radius: 34, fill: 0x7d8790, stroke: 0xd7dee4 },
    platform: { radius: 14, fill: 0xd3a449, stroke: 0xf3d99b },
    tug: { radius: 18, fill: 0x6fa9ce, stroke: 0xc3e5ff },
    shuttle: { radius: 8, fill: 0xf4f5f0, stroke: 0xffffff },
    escort: { radius: 13, fill: 0xb76c6f, stroke: 0xf0b7b9 }
  };

  // Local artwork scale; the camera still scales positions geometrically.
  // Through 32x, small craft shed their schematic magnification. Beyond that,
  // freeze local artwork scale so camera zoom magnifies every object together.
  // This preserves inspection proportions; it is not a physical hull calibration.
  /** @param {string} type @param {number} zoom @returns {number} */
  function semanticScale(type, zoom) {
    if (type === 'asteroid') return 1;
    var large = type === 'mothership' || type === 'asteroid';
    var exponent = large ? 0.95 : (type === 'platform' || type === 'tug' || type === 'depot' ? 0.12 : 0.08);
    // Every class stops shrinking on screen below the baseline. Keeping the
    // same floor for all classes preserves their tactical size hierarchy.
    var tacticalZoom = Math.min(DETAIL_ZOOM_START, zoom);
    return Math.pow(Math.max(1, tacticalZoom), exponent) / tacticalZoom;
  }

  /** @param {PIXI.Graphics | PIXI.Container} graphics @param {Ship} ship @param {boolean} selected @param {number} elapsedSeconds @param {Ship | Wreck | undefined} towedEntity @param {number} towedScale @param {number} zoom */
  function paintShip(graphics, ship, selected, elapsedSeconds, towedEntity, towedScale, zoom) {
    var style = SHIP_STYLES[ship.type];
    if (ship.type === 'mothership' && graphics.mothershipParts) {
      var parts = graphics.mothershipParts;
      parts.base.clear();
      parts.base.engineScreenScale = graphics.engineScreenScale;
      drawEnginePlume(parts.base, ship, style.radius, elapsedSeconds);
      paintMothershipShader(parts, selected, elapsedSeconds, ship.rotation || 0,
        zoom * (graphics.scale ? graphics.scale.x : 1));
      drawShipOrderAndBadges(parts.base, ship, style);
      return;
    }
    var g = /** @type {PIXI.Graphics} */ (graphics);
    g.clear();
    g.alpha = ship.disabled && ship.launchElapsed == null ? 0.45 : 1;
    drawEnginePlume(g, ship, style.radius, elapsedSeconds);
    if (ship.type === 'mothership') {
      paintMothership(g, selected, elapsedSeconds, ship.rotation || 0);
      drawShipOrderAndBadges(g, ship, style);
      return;
    }

    if (ship.type === 'tug' && ship.carryingSection) {
      paintConstructorCargo(g, style);
    }
    g.lineStyle(0);
    if (ship.type === 'tug') {
      if (ship.platformId) {
        paintIndustrialPlatform(g, 0, false, elapsedSeconds, zoom, ship.rotation);
      }
      if (ship.towTarget) paintTowedHull(g, ship.towTarget.kind, towedEntity, style, towedScale, zoom, ship.rotation);
      paintSlimTug(g, zoom, ship.rotation);
      if (ship.cargoOperation && ship.cargoOperation.remainingSeconds > 0) {
        drawCargoEvaWorkers(g, ship.id, elapsedSeconds,
          ship.cargoOperation.kind === 'deploy-platform' || ship.cargoOperation.kind === 'deploy-section');
      }
    } else if (ship.type === 'shuttle') {
      paintShuttleHull(g, zoom, ship.rotation);
    } else {
      paintFighterHull(g, zoom, ship.rotation, 1);
    }

    if (selected) {
      var halfX = ship.type === 'tug' ? 18 : style.radius + 1;
      var halfY = ship.type === 'tug' ? 18 : ship.type === 'shuttle' ? 5 : 11;
      if (ship.carryingSection) {
        halfX = Math.max(halfX, cargoModuleGeometry().length / 2);
        halfY = Math.max(halfY, cargoModuleGeometry().width / 2);
      }
      if (ship.towTarget) { halfX = Math.max(halfX, 14 * towedScale); halfY = Math.max(halfY, 9 * towedScale); }
      drawCraftBrackets(g, halfX, halfY, zoom * semanticScale(ship.type, zoom));
    }
    drawShipOrderAndBadges(g, ship, style);
  }

  /** @param {number} zoom */
  function craftDetail(zoom) {
    /** @param {number} start @param {number} end */
    function fade(start, end) {
      var t = Math.max(0, Math.min(1, (zoom - start) / (end - start)));
      return t * t * (3 - 2 * t);
    }
    return { machinery: fade(8, 32), fine: fade(32, 96) };
  }

  /** @param {import('./types').Platform} platform */
  function platformDeployment(platform) {
    var logistics = Driftworks.logistics;
    if (!logistics) return 0;
    if (platform.state === 'setting-up' && platform.landingElapsedSeconds !== undefined && Driftworks.miningLanding) return Driftworks.miningLanding.sample(platform.landingElapsedSeconds).deployment;
    var value = platform.state === 'deployed' ? 1 : platform.state === 'setting-up'
      ? 1 - (platform.setupRemainingSeconds || 0) / logistics.setupSeconds
      : platform.state === 'packing-up' ? (platform.packRemainingSeconds || 0) / logistics.packSeconds : 0;
    return Math.max(0, Math.min(1, value));
  }

  /** Slope-aligned tangent projection composed AFTER the platform heading.
   * @param {AsteroidNormal} normal @param {number} heading @param {number} scale
   */
  function platformProjection(normal, heading, scale) {
    var length = Math.hypot(normal.x, normal.y, normal.z) || 1;
    var compression = Math.max(0.2, Math.min(1, normal.z / length));
    var slopeSquared = normal.x * normal.x + normal.y * normal.y;
    var k = slopeSquared > 1e-12 ? (1 - compression) / slopeSquared : 0;
    var xx = 1 - normal.x * normal.x * k, xy = -normal.x * normal.y * k;
    var yy = 1 - normal.y * normal.y * k;
    var c = Math.cos(heading), s = Math.sin(heading);
    return { a: scale * (xx * c + xy * s), b: scale * (xy * c + yy * s),
      c: scale * (-xx * s + xy * c), d: scale * (-xy * s + yy * c), compression: compression };
  }

  /** Sample the shader's broad dome and shared relief, without pixel-level noise.
   * @param {import('./types').AsteroidVisual} visual @param {number} x @param {number} y
   * @returns {AsteroidNormal}
   */
  function platformSurfaceNormal(visual, x, y) {
    /** @param {number} px @param {number} py */
    function height(px, py) {
      var angle = Math.atan2(py, px);
      var boundary = 0.88 + 0.07 * Math.cos(angle * 3) + 0.05 * Math.sin(angle * 5);
      var q = Math.min(0.997, Math.hypot(px, py) / boundary);
      return Math.sqrt(Math.max(0.002, 1 - q * q)) * 0.78 + asteroidReliefAt(visual, px, py);
    }
    var e = 0.0035;
    var dx = (height(x + e, y) - height(x - e, y)) / (2 * e);
    var dy = (height(x, y + e) - height(x, y - e)) / (2 * e);
    var length = Math.hypot(dx, dy, 1);
    return { x: -dx / length, y: -dy / length, z: 1 / length };
  }

  /** @param {import('./types').Platform} platform @param {World} world @param {Asteroid | undefined} asteroid */
  function platformIsWorking(platform, world, asteroid) {
    return platform.state === 'deployed' && world.miningMission === 'active' && !!asteroid && asteroid.ore > 0 &&
      (!world.staffingEnabled || (platform.workerIds || []).length >= 5);
  }

  /** @param {PIXI.Graphics} g @param {number} color @param {number} x @param {number} y @param {number} w @param {number} h @param {number} [alpha] */
  function mechanicalBlock(g, color, x, y, w, h, alpha) {
    g.lineStyle(0); g.beginFill(color, alpha === undefined ? 1 : alpha);
    g.drawRect(x, y, w, h); g.endFill();
  }

  /** @param {number} color @param {number} rotation @param {number} side */
  function mechanicalFace(color, rotation, side) {
    var light = mothershipLocalLight(rotation);
    return shadeMechanicalColor(color, 0.48 + 0.6 * Math.max(0, light.z * 0.8 + side * light.y * 0.6));
  }

  /** @param {PIXI.Graphics} g @param {number} halfX @param {number} halfY @param {number} screenScale */
  function drawCraftBrackets(g, halfX, halfY, screenScale) {
    var length = 5 / screenScale, pad = 4 / screenScale;
    g.lineStyle(1 / screenScale, 0xd9f5ff, 0.75);
    [-1, 1].forEach(function (x) { [-1, 1].forEach(function (y) {
      var px = x * (halfX + pad), py = y * (halfY + pad);
      g.moveTo(px - x * length, py); g.lineTo(px, py); g.lineTo(px, py - y * length);
    }); });
  }

  /** @param {PIXI.Graphics} g @param {number} zoom @param {number} rotation @param {number} scale */
  function paintFighterHull(g, zoom, rotation, scale) {
    var detail = craftDetail(zoom);
    [-1, 1].forEach(function (side) {
      g.lineStyle(0); g.beginFill(mechanicalFace(0xb76c6f, rotation, side), 1);
      g.drawPolygon([13 * scale, 0, -9.36 * scale, side * 8.06 * scale, -5.85 * scale, 0]); g.endFill();
    });
    g.beginFill(0x263b47, 1);
    g.drawPolygon([7 * scale, 0, -3 * scale, -1.5 * scale, -5 * scale, 0, -3 * scale, 1.5 * scale]); g.endFill();
    mechanicalBlock(g, 0x162630, -10.66 * scale, -1.5 * scale, 3 * scale, 3 * scale);
    [-1, 1].forEach(function (side) {
      mechanicalBlock(g, 0x202d35, -7 * scale, side * 5 * scale - scale, 3 * scale, 2 * scale, detail.machinery);
      mechanicalBlock(g, 0xd1afb0, scale, side * 2.2 * scale, 2 * scale, 0.35 * scale, detail.fine);
    });
  }

  /** @param {PIXI.Graphics} g @param {number} zoom @param {number} rotation */
  function paintShuttleHull(g, zoom, rotation) {
    var detail = craftDetail(zoom);
    g.lineStyle(0); g.beginFill(mechanicalFace(0xdde4df, rotation, -1), 1);
    g.drawRoundedRect(-8, -4, 16, 8, 3); g.endFill();
    mechanicalBlock(g, mechanicalFace(0xdde4df, rotation, 1), -5, 0, 10, 3);
    mechanicalBlock(g, 0x243d4b, 2, -2, 3, 4);
    mechanicalBlock(g, 0x243039, -8, -1.5, 2, 3);
    mechanicalBlock(g, 0x839da7, -1, -4, 2, 1.2, detail.machinery);
    mechanicalBlock(g, 0x485d67, -3, -2.6, 0.35, 5.2, detail.fine);
  }

  /** @param {PIXI.Graphics} g @param {number} zoom @param {number} rotation */
  function paintSlimTug(g, zoom, rotation) {
    var detail = craftDetail(zoom), steel = mechanicalFace(0x79909d, rotation, -1);
    [-10.44, 10.44].forEach(function (x) {
      mechanicalBlock(g, 0x253640, x - 0.6, -15.84, 1.2, 31.68);
      mechanicalBlock(g, steel, x - 0.6, -15.84, 0.45, 31.68);
      [-1, 1].forEach(function (side) {
        mechanicalBlock(g, steel, x - 5.4, side * 16.2 - 0.55, 10.8, 1.1);
        mechanicalBlock(g, 0x1d2d37, x - 1.1, side * 16.2 - 1, 2.2, 2);
        g.lineStyle(0.45, 0x92aab4, detail.machinery * 0.7);
        g.moveTo(x, side * 7); g.lineTo(x - 4, side * 15.6);
        mechanicalBlock(g, 0xc6aa62, x - 2, side * 8 - 0.6, 4, 1.2, detail.machinery);
      });
    });
    mechanicalBlock(g, steel, -16.2, -0.65, 32.4, 1.3);
    mechanicalBlock(g, 0x345a70, -3, -2.4, 6, 4.8);
    mechanicalBlock(g, 0x83aec2, -2.7, -2.2, 5.4, 0.7);
    mechanicalBlock(g, 0x172b36, -1, -1.3, 3, 2.6, detail.machinery);
    mechanicalBlock(g, 0x192832, -16.8, -1.6, 2.5, 3.2);
    [-1, 1].forEach(function (side) {
      mechanicalBlock(g, 0x192832, 14.5, side * 2.88 - 0.8, 2, 1.6);
      mechanicalBlock(g, 0xe0bb67, 6, side * 0.7, 2, 0.3, detail.fine);
    });
  }

  /** Local tangent coordinates plus elevation along the outward surface normal.
   * @param {AsteroidNormal} normal @param {number} x @param {number} y @param {number} height
   */
  function platformRaisedPoint(normal, x, y, height) {
    var p = platformProjection(normal, 0, 1);
    return { x: p.a * x + p.c * y + normal.x * height,
      y: p.b * x + p.d * y + normal.y * height };
  }

  /** Project the same fitted rig mesh for the tactical 2D view; static poses are cached by the scene.
   * @param {PIXI.Graphics} g @param {import('./types').PlatformSurface} surface @param {number} deployment @param {number} ramps @param {number} yaw @param {number} heading */
  function paintTerrainPlatform(g,surface,deployment,ramps,yaw,heading){
    var scene=Driftworks.scene3d;if(!scene)return;
    var groups=scene.platformSurfaceGeometry(surface,deployment,ramps),c=Math.cos(yaw),s=Math.sin(yaw);
    /** @type {Record<string,number>} */ var colors={ochre:0xd4a34a,steel:0x758784,dark:0x1a2630,light:0xe3ca7d,lamp:0xfff0c7,marker:0x59f2d9};
    /** @type {{points:number[];depth:number;color:number}[]} */ var faces=[];
    Object.keys(groups).forEach(function(material){var data=groups[material];
      for(var i=0;i<data.length;i+=18){
        var nx=data[i+3]*c-data[i+4]*s,ny=data[i+3]*s+data[i+4]*c,n=surface.fit.rotate([nx,ny,data[i+5]]);if(n[2]<=0)continue;
        /** @type {number[]} */ var points=[];var depth=0;
        for(var j=0;j<18;j+=6){var x=data[i+j]*c-data[i+j+1]*s,y=data[i+j]*s+data[i+j+1]*c,v=surface.fit.world([x,y,data[i+j+2]]);points.push(v[0],v[1]);depth+=v[2];}
        var flood=Driftworks.miningLights?Driftworks.miningLights.irradiance(Driftworks.miningLights.model,[(data[i]+data[i+6]+data[i+12])/3,(data[i+1]+data[i+7]+data[i+13])/3,(data[i+2]+data[i+8]+data[i+14])/3],[data[i+3],data[i+4],data[i+5]])[0]:0;
        faces.push({points:points,depth:depth,color:material==='lamp'||material==='marker'?colors[material]:shadeMechanicalColor(colors[material],.45+flood*.65+.55*Math.max(0,n[2]*.8+n[0]*Math.cos(heading)*.4-n[1]*Math.sin(heading)*.4))});
      }
    });
    faces.sort(function(a,b){return a.depth-b.depth;});g.lineStyle(0);
    faces.forEach(function(face){g.beginFill(face.color,1);g.drawPolygon(face.points);g.endFill();});
  }

  /** @param {PIXI.Graphics} g @param {number} deployment @param {boolean} working @param {number} time @param {number} zoom @param {number} rotation @param {AsteroidNormal} normal */
  function paintRaisedPlatform(g, deployment, working, time, zoom, rotation, normal) {
    var light = mothershipLocalLight(rotation), detail = craftDetail(zoom);
    var plane = platformProjection(normal, 0, 1);
    // Tangent axes' Z components establish which side walls face the camera.
    var tx = { x: plane.a, y: plane.b, z: -normal.x };
    var ty = { x: plane.c, y: plane.d, z: -normal.y };
    /** @param {number} color @param {AsteroidNormal} face */
    function lit(color, face) {
      var denominator = Math.hypot(light.x, light.y, light.z) * Math.hypot(face.x, face.y, face.z);
      return shadeMechanicalColor(color, 0.38 + 0.8 * Math.max(0,
        (face.x * light.x + face.y * light.y + face.z * light.z) / Math.max(0.001, denominator)));
    }
    /** @param {number[][]} points @param {number} color @param {number} [alpha] */
    function polygon(points, color, alpha) {
      var flat = points.map(function (v) { return platformRaisedPoint(normal, v[0], v[1], v[2]); });
      g.lineStyle(0); g.beginFill(color, alpha === undefined ? 1 : alpha);
      g.drawPolygon(flat.reduce(function (out, point) { return out.concat([point.x, point.y]); }, /** @type {number[]} */ ([])));
      g.endFill();
    }
    /** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} bottom @param {number} top @param {number} color */
    function box(x, y, w, h, bottom, top, color) {
      [-1, 1].forEach(function (side) {
        if (side * tx.z > 0) {
          var edgeX = side < 0 ? x : x + w;
          polygon([[edgeX,y,bottom],[edgeX,y+h,bottom],[edgeX,y+h,top],[edgeX,y,top]],
            lit(color, {x:side*tx.x,y:side*tx.y,z:side*tx.z}));
        }
        if (side * ty.z > 0) {
          var edgeY = side < 0 ? y : y + h;
          polygon([[x,edgeY,bottom],[x+w,edgeY,bottom],[x+w,edgeY,top],[x,edgeY,top]],
            lit(color, {x:side*ty.x,y:side*ty.y,z:side*ty.z}));
        }
      });
      polygon([[x,y,top],[x+w,y,top],[x+w,y+h,top],[x,y+h,top]], lit(color,normal));
    }
    // A restrained ground shadow separates the body from its contact plane.
    polygon([[-12,-8,0],[12,-8,0],[12,8,0],[-12,8,0]],0x080e12,0.24);
    /** @type {{x:number,side:number,depth:number}[]} */
    var legs = [];
    [-9,-3,3,9].forEach(function (x) { [-1,1].forEach(function (side) {
      legs.push({x:x,side:side,depth:-normal.x*x-normal.y*side*12});
    }); });
    legs.sort(function (a,b) { return a.depth-b.depth; });
    /** @param {{x:number,side:number,depth:number}} leg */
    function drawLeg(leg) {
      var x=leg.x, side=leg.side;
      var footX=x*(1+deployment*0.7), footY=side*(9+deployment*10);
      var kneeX=x*(1+deployment*0.25), kneeY=side*(7.5+deployment*5);
      var root=platformRaisedPoint(normal,x,side*5,5);
      var knee=platformRaisedPoint(normal,kneeX,kneeY,3.5);
      var foot=platformRaisedPoint(normal,footX,footY,0.6);
      box(footX-2.2,footY-1.7,4.4,3.4,0,0.6,0x77817a);
      g.lineStyle(3.5,lit(0xb99243,normal),1); g.moveTo(root.x,root.y); g.lineTo(knee.x,knee.y);
      g.lineStyle(2.7,lit(0x89928b,normal),1); g.moveTo(knee.x,knee.y); g.lineTo(foot.x,foot.y);
      box(kneeX-1.7,kneeY-1.3,3.4,2.6,3,4.3,0xb99243);
    }
    legs.filter(function (leg) { return leg.depth<=0; }).forEach(drawLeg);
    box(-12,-8,24,16,3.5,8,0xd3a449);
    // Recessed top compartment and raised sorting/excavation hardware.
    polygon([[-6,-4.5,8.02],[6,-4.5,8.02],[6,3,8.02],[-6,3,8.02]],0x253137);
    box(3,-3,6+deployment*5,3,8,10,0x9b8857);
    box(8+deployment*5,-4,3,7,6,10,0x35454a);
    if (detail.machinery>0) {
      [-1,1].forEach(function (side) { box(-9,side*5,4,1,8,8.5,0xe3bd68); });
    }
    legs.filter(function (leg) { return leg.depth>0; }).forEach(drawLeg);
  }

  /** @param {PIXI.Graphics} g @param {number} deployment @param {boolean} working @param {number} time @param {number} zoom @param {number} rotation */
  function paintIndustrialPlatform(g, deployment, working, time, zoom, rotation) {
    var detail = craftDetail(zoom);
    // Four independently articulated legs on each flank. Broad armored upper
    // links and angular feet keep these readable as excavator legs, not wheels.
    [-9, -3, 3, 9].forEach(function (rootX) { [-1, 1].forEach(function (side) {
      var kneeX = rootX * (1 + deployment * 0.25);
      var kneeY = side * (7.5 + deployment * 5);
      var footX = rootX * (1 + deployment * 0.7);
      var footY = side * (9 + deployment * 10);
      g.lineStyle(3.8, mechanicalFace(0xb99243, rotation, side), 1);
      g.moveTo(rootX, side * 5); g.lineTo(kneeX, kneeY);
      g.lineStyle(2.8, mechanicalFace(0x89928b, rotation, side), 1);
      g.moveTo(kneeX, kneeY); g.lineTo(footX, footY);
      g.lineStyle(0.65, 0xc8d0c8, 0.65);
      g.moveTo(kneeX - 0.65, kneeY); g.lineTo(footX - 0.65, footY);
      mechanicalBlock(g, 0x3a403a, kneeX - 1.9, kneeY - 1.5, 3.8, 3);
      mechanicalBlock(g, mechanicalFace(0xd3a449, rotation, side), kneeX - 1.4, kneeY - 1.1, 2.8, 1.5);
      mechanicalBlock(g, 0x263238, footX - 2.2, footY - 1.7, 4.4, 3.4);
      mechanicalBlock(g, 0x77817a, footX - 1.9, footY - 1.4, 3.8, 0.65);
    }); });
    g.lineStyle(0); g.beginFill(mechanicalFace(0xd3a449, rotation, -1), 1);
    g.drawRoundedRect(-12, -8, 24, 16, 4); g.endFill();
    mechanicalBlock(g, mechanicalFace(0xb28434, rotation, 1), -9, 3, 18, 4);
    mechanicalBlock(g, 0x273136, -6, -4.5, 12, 7.5);
    mechanicalBlock(g, 0x806e48, 3, -3, 6 + deployment * 5, 3);
    mechanicalBlock(g, 0x17272d, 8 + deployment * 5, -4, 3, 7);
    [-1, 1].forEach(function (side) {
      mechanicalBlock(g, 0xe3bd68, -9, side * 5, 4, 1, detail.machinery);
      mechanicalBlock(g, 0x514532, -10, side * 6, 18, 0.35, detail.fine);
    });

  }

  /** @param {PIXI.Graphics} graphics @param {string} kind @param {Ship | Wreck | undefined} entity @param {ShipStyle} tugStyle @param {number} hullScale @param {number} zoom @param {number} rotation */
  function paintTowedHull(graphics, kind, entity, tugStyle, hullScale, zoom, rotation) {
    var centerX = 0;
    var centerY = -1;
    if (kind === 'ship') {
      paintFighterHull(graphics, zoom, rotation, hullScale);
      return;
    }
    var points = kind === 'wreck'
      ? [[11, 0], [-8, -7], [-2, -1], [-6, 3], [-8, 7]]
      : [[13, 0], [-9, -8], [-4, 0], [-9, 8]];
    /** @type {number[]} */
    var polygon = [];
    points.forEach(function (point) {
      polygon.push(centerX + point[0] * hullScale, centerY + point[1] * hullScale);
    });
    var stroke = kind === 'wreck' ? 0xc4ae7d : SHIP_STYLES.escort.stroke;
    var fill = kind === 'wreck' ? 0x5f5158 : SHIP_STYLES.escort.fill;
    graphics.lineStyle(1.5, stroke, kind === 'wreck' ? 0.9 : 1);
    graphics.beginFill(fill, kind === 'wreck' ? 0.8 : 0.98);
    graphics.drawPolygon(polygon);
    graphics.endFill();
    if (kind === 'ship' && entity && entity.disabled) {
      graphics.lineStyle(1, 0xffffff, 0.65);
      graphics.moveTo(centerX - 4 * hullScale, centerY);
      graphics.lineTo(centerX + 3 * hullScale, centerY);
    }
    graphics.lineStyle(1.5, tugStyle.stroke, 0.9);
    graphics.moveTo(-0.25 * tugStyle.radius, -0.25 * tugStyle.radius);
    graphics.lineTo(centerX - 4 * hullScale, centerY - 4 * hullScale);
    graphics.moveTo(-0.25 * tugStyle.radius, 0.25 * tugStyle.radius);
    graphics.lineTo(centerX - 4 * hullScale, centerY + 4 * hullScale);
  }

  /** @param {PIXI.Graphics} graphics @param {string[]} workerIds @param {number} elapsedSeconds @param {boolean} packingUp @param {AsteroidNormal} [normal] */
  function drawPlatformWorkers(graphics, workerIds, elapsedSeconds, packingUp, normal) {
    var positions = workerIds.map(function (personId, index) {
      var seed = 0;
      for (var i = 0; i < personId.length; i += 1) seed = (seed * 31 + personId.charCodeAt(i)) >>> 0;
      var homeAngle = (seed % 6283) / 1000;
      var radius = 21 + (seed >>> 8) % 7;
      var period = 17 + (seed >>> 16) % 11;
      var activityTime = elapsedSeconds / period + (seed % 997) / 997;
      var segment = Math.floor(activityTime);
      var blend = activityTime - segment;
      blend = blend * blend * (3 - 2 * blend);
      var fromOffset = (Math.floor((seed % 37) / 11) - 1) * 0.45;
      var toOffset = (Math.floor(((seed >>> 5) % 37) / 11) - 1) * 0.45;
      if (packingUp) { fromOffset *= -1; toOffset *= -1; }
      var fromAngle = homeAngle + fromOffset + segment * (0.13 + index * 0.035);
      var toAngle = homeAngle + toOffset + (segment + 1) * (0.13 + index * 0.035);
      var angle = fromAngle + (toAngle - fromAngle) * blend;
      var distance = radius + Math.sin(elapsedSeconds * 0.17 + index * 1.7 + seed % 29) * 2.5;
      return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
    });
    var separationX = workerIds.map(function () { return 0; });
    var separationY = workerIds.map(function () { return 0; });
    positions.forEach(function (position, index) {
      positions.forEach(function (other, otherIndex) {
        if (index === otherIndex) return;
        var dx = position.x - other.x;
        var dy = position.y - other.y;
        var distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > 0 && distanceSquared < 12 * 12) {
          var strength = (12 - Math.sqrt(distanceSquared)) / 12;
          separationX[index] += dx / Math.sqrt(distanceSquared) * strength * 5;
          separationY[index] += dy / Math.sqrt(distanceSquared) * strength * 5;
        }
      });
    });
    positions.forEach(function (position, index) {
      var x = position.x + separationX[index];
      var y = position.y + separationY[index];
      var distance = Math.sqrt(x * x + y * y);
      if (distance > 32) { x *= 32 / distance; y *= 32 / distance; }
      if (normal) {
        var projectedWorker = platformRaisedPoint(normal, x, y, 1.8);
        x = projectedWorker.x; y = projectedWorker.y;
      }
      graphics.lineStyle(1, 0xc5d9d8, 0.9);
      graphics.beginFill(0xe7f0e5, 1);
      graphics.drawCircle(x, y, 1.8);
      graphics.endFill();
    });
  }

  /** @param {PIXI.Graphics} graphics @param {string} shipId @param {number} elapsedSeconds @param {boolean} deploying */
  function drawCargoEvaWorkers(graphics, shipId, elapsedSeconds, deploying) {
    var seed = 0;
    for (var i = 0; i < shipId.length; i += 1) seed = (seed * 31 + shipId.charCodeAt(i)) >>> 0;
    [0, 1].forEach(function (index) {
      var direction = index ? -1 : 1;
      var phase = elapsedSeconds * (0.7 + index * 0.11) + seed * 0.001 + index * Math.PI;
      var reach = 22 + Math.sin(phase * 0.63) * 4;
      var x = (deploying ? 1 : -1) * 4 + Math.cos(phase) * reach;
      var y = direction * 7 + Math.sin(phase * 0.83) * 12;
      graphics.lineStyle(0.8, 0xb8d2d5, 0.55);
      graphics.moveTo(x - Math.cos(phase) * 3, y - Math.sin(phase * 0.83) * 3);
      graphics.lineTo(x, y);
      graphics.beginFill(index ? 0xe7f0e5 : 0xd5b66f, 1);
      graphics.drawCircle(x, y, 1.9);
      graphics.endFill();
    });
  }

  /** @param {PIXI.Graphics} graphics @param {ShipStyle} style */
  function paintMiningPlatform(graphics, style) {
    var r = style.radius;
    graphics.beginFill(style.fill, 0.85);
    [-0.55, 0, 0.55].forEach(function (x) {
      [-1, 1].forEach(function (side) {
        graphics.drawRoundedRect((x - 0.15) * r, (side < 0 ? -0.83 : 0.4) * r, 0.3 * r, 0.43 * r, 1);
      });
    });
    graphics.endFill();
    graphics.beginFill(style.fill, 1);
    graphics.drawRoundedRect(-0.86 * r, -0.56 * r, 1.72 * r, 1.12 * r, 0.35 * r);
    graphics.endFill();
    graphics.lineStyle(1, style.stroke, 0.35);
    graphics.moveTo(0.45 * r, -0.3 * r);
    graphics.lineTo(0.45 * r, 0.3 * r);
  }

  /** @param {PIXI.Graphics} graphics @param {ShipStyle} style */
  function paintConstructorCargo(graphics, style) {
    var r = style.radius;
    var module = cargoModuleGeometry();
    graphics.lineStyle(0.45, 0x24343f, 0.6);
    graphics.beginFill(0x53616b, 1);
    graphics.drawRoundedRect(-module.length / 2, -module.width / 2, module.length, module.width, 1.5);
    graphics.endFill();
    graphics.lineStyle(1, 0x28353e, 0.8);
    [-0.36, 0.36].forEach(function (y) {
      graphics.moveTo(-0.48 * r, y * r);
      graphics.lineTo(0.48 * r, y * r);
    });
    graphics.lineStyle(0.7, 0x819ca9, 0.6);
    [-0.58, 0.58].forEach(function (x) {
      [-1, 1].forEach(function (side) {
        graphics.moveTo(x * r, side * module.width / 2);
        graphics.lineTo(x * r, side * 0.84 * r);
      });
    });
  }

  /** @param {PIXI.Graphics} graphics @param {ShipStyle} style */
  function paintConstructor(graphics, style) {
    var r = style.radius;
    graphics.beginFill(style.fill, 0.8);
    [-0.58, 0.58].forEach(function (x) {
      graphics.drawRoundedRect((x - 0.055) * r, -0.88 * r, 0.11 * r, 1.76 * r, 0.6);
    });
    [-1, 1].forEach(function (side) {
      graphics.drawRoundedRect(-0.88 * r, (side < 0 ? -0.96 : 0.84) * r, 0.66 * r, 0.12 * r, 0.6);
      graphics.drawRoundedRect(0.22 * r, (side < 0 ? -0.96 : 0.84) * r, 0.66 * r, 0.12 * r, 0.6);
    });
    graphics.endFill();
    graphics.beginFill(style.fill, 1);
    graphics.drawRoundedRect(-0.9 * r, -0.23 * r, 1.8 * r, 0.46 * r, 1.8);
    graphics.endFill();
    graphics.lineStyle(1, style.stroke, 0.4);
    graphics.moveTo(0.6 * r, -0.15 * r);
    graphics.lineTo(0.6 * r, 0.15 * r);
  }

  /** @param {PIXI.Graphics} graphics @param {Ship} ship @param {ShipStyle} style */
  function drawShipOrderAndBadges(graphics, ship, style) {
    if (ship.order.kind === 'move') {
      graphics.lineStyle(1, 0x7aa9c2, 0.5);
      drawWorldOrderLine(graphics, ship);
    } else if (ship.order.kind === 'deploy' || ship.order.kind === 'retrieve-platform') {
      graphics.lineStyle(1, 0xd3a449, 0.65);
      drawWorldOrderLine(graphics, ship);
    } else if (ship.order.kind === 'return') {
      graphics.lineStyle(1, 0x9ed6c8, 0.65);
      drawWorldOrderLine(graphics, ship);
    } else if (ship.order.kind === 'build' || ship.order.kind === 'recover') {
      graphics.lineStyle(1, 0xbfd6ea, 0.7);
      drawWorldOrderLine(graphics, ship);
    }

    if (ship.type === 'tug' && ship.cargo > 0) {
      var filled = 1;
      graphics.lineStyle(0);
      graphics.beginFill(0xd3a449, 0.95);
      graphics.drawRect(-10, style.radius + 6, 20 * filled, 3);
      graphics.endFill();
    }

    if (ship.type === 'escort' && ship.damage > 0 && !ship.disabled) {
      graphics.lineStyle(0);
      graphics.beginFill(0xd5ae65, 0.8);
      graphics.drawRect(-8, 13, 16 * Math.max(0, 1 - ship.damage), 2);
      graphics.endFill();
    }

  }

  /** @param {PIXI.Graphics} graphics @param {boolean} selected @param {number} elapsedSeconds @param {number} shipRotation */
  function paintMothership(graphics, selected, elapsedSeconds, shipRotation) {
    drawMothershipHabitat(graphics, elapsedSeconds, shipRotation);
    drawMothershipBearing(graphics, elapsedSeconds);
    drawMothershipCore(graphics, shipRotation);
    if (selected) drawMothershipSelectionBrackets(graphics, elapsedSeconds);
  }

  var MOTHERSHIP_VERTEX_SHADER = [
    'precision highp float;',
    'attribute vec2 aVertexPosition;',
    'uniform mat3 translationMatrix;',
    'uniform mat3 projectionMatrix;',
    'varying vec2 vLocalCoord;',
    'void main(){vLocalCoord=aVertexPosition;vec3 p=projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0);gl_Position=vec4(p.xy,0.0,1.0);}'
  ].join('\n');

  var MOTHERSHIP_FRAGMENT_SHADER = [
    'precision highp float;',
    'varying vec2 vLocalCoord;',
    'uniform vec3 uLight;',
    'uniform float uSpin;',
    'uniform float uPixelFootprint;',
    'const float PI=3.141592653589793;',
    'float roundedBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}',
    'float lineMask(float value,float center,float halfWidth,float aa){return 1.0-smoothstep(halfWidth,halfWidth+aa,abs(value-center));}',
    Driftworks.miningLights?Driftworks.miningLights.shaderSource:'vec3 rigIllumination(vec3 p,vec3 n){return vec3(0.);}',
    'void main(){',
    ' vec2 p=vLocalCoord;float aa=max(.035,uPixelFootprint);float dist=roundedBox(p,vec2(31.0,12.0),5.0);float alpha=1.0-smoothstep(-aa,aa,dist);',
    ' if(alpha<=0.0){gl_FragColor=vec4(0.0);return;}',
    ' float ny=clamp(p.y/17.0,-1.0,1.0);float nz=sqrt(max(0.0,1.0-ny*ny));vec3 n=vec3(0.0,ny,nz);float diffuse=max(0.0,dot(n,normalize(uLight)));',
    ' vec3 color=vec3(.49,.529,.565)*(.61+diffuse*.55);',
    ' float edge=1.0-smoothstep(0.0,2.2,-dist);color=mix(color,vec3(.20,.275,.314),edge*.72);',
    ' float theta=asin(ny);float bandWave=abs(sin((theta-uSpin)*3.0));float bands=1.0-smoothstep(.0,.055+aa*.018,bandWave);color=mix(color,vec3(.74,.85,.89),bands*.25*nz);',
    ' float ribs=0.0;ribs=max(ribs,lineMask(p.x,-25.0,.42,aa));ribs=max(ribs,lineMask(p.x,-15.0,.42,aa));ribs=max(ribs,lineMask(p.x,15.0,.42,aa));ribs=max(ribs,lineMask(p.x,25.0,.42,aa));color=mix(color,vec3(.21,.29,.33),ribs*.72);',
    ' float lightY=sin(uSpin)*15.0;float lampA=(1.0-smoothstep(1.25,1.25+aa,length(p-vec2(-26.0,lightY))))*max(0.0,cos(uSpin));float lampB=(1.0-smoothstep(1.25,1.25+aa,length(p-vec2(26.0,-lightY))))*max(0.0,cos(uSpin+PI));color=mix(color,vec3(.74,.88,.92),clamp(lampA+lampB,0.0,1.0)*nz);',
    ' float panelPhase=uSpin+.72;float panelY=sin(panelPhase)*16.5;float panelFront=max(0.0,cos(panelPhase));float panel=1.0-smoothstep(-aa,aa,roundedBox(p-vec2(22.5,panelY),vec2(3.5,1.0),1.0));color=mix(color,vec3(.23,.28,.30),panel*panelFront*.9);',
    ' float panelEdge=(1.0-smoothstep(-aa,aa,roundedBox(p-vec2(22.5,panelY),vec2(4.2,1.7),1.0)))-panel;color=mix(color,vec3(.91,.76,.43),max(0.0,panelEdge)*panelFront*.8);',
    ' gl_FragColor=vec4(color*alpha,alpha);',
    '}'
  ].join('\n');

  function createMothershipGraphic() {
    var container = new PIXI.Container();
    var base = new PIXI.Graphics();
    var geometry = new PIXI.Geometry()
      .addAttribute('aVertexPosition', [-37, -18, 37, -18, 37, 18, -37, 18], 2)
      .addIndex([0, 1, 2, 0, 2, 3]);
    var shader = PIXI.Shader.from(MOTHERSHIP_VERTEX_SHADER, MOTHERSHIP_FRAGMENT_SHADER,
      mothershipHabitatUniforms(0, 0, 1));
    var habitat = new PIXI.Mesh(geometry, shader);
    var overlay = new PIXI.Graphics();
    container.addChild(base, habitat, overlay);
    container.mothershipParts = { base: base, habitat: habitat, shader: shader, overlay: overlay };
    container.hitArea = new PIXI.Circle(0, 0, 42);
    return container;
  }

  /** @param {number} elapsedSeconds @param {number} shipRotation @param {number} screenScale */
  function mothershipHabitatUniforms(elapsedSeconds, shipRotation, screenScale) {
    var light = mothershipLocalLight(shipRotation);
    return { uLight: new Float32Array([light.x, light.y, light.z]),
      uSpin: elapsedSeconds * Math.PI * 2 / 38,
      uPixelFootprint: 1 / Math.max(1, screenScale || 1) };
  }

  /** CPU reference for the shader's front-hemisphere lamp rejection. @param {number} spin */
  function mothershipHabitatLampVisibility(spin) {
    return { left: Math.max(0, Math.cos(spin)), right: Math.max(0, Math.cos(spin + Math.PI)) };
  }

  /** @param {{base:PIXI.Graphics, habitat:PIXI.Mesh, shader:PIXI.Shader, overlay:PIXI.Graphics}} parts @param {boolean} selected @param {number} elapsedSeconds @param {number} shipRotation @param {number} screenScale */
  function paintMothershipShader(parts, selected, elapsedSeconds, shipRotation, screenScale) {
    var uniforms = mothershipHabitatUniforms(elapsedSeconds, shipRotation, screenScale);
    var light = /** @type {Float32Array} */ (parts.shader.uniforms.uLight);
    light.set(uniforms.uLight);
    parts.shader.uniforms.uSpin = uniforms.uSpin;
    parts.shader.uniforms.uPixelFootprint = uniforms.uPixelFootprint;
    parts.overlay.clear();
    drawMothershipBearing(parts.overlay, elapsedSeconds);
    drawMothershipCore(parts.overlay, shipRotation);
    if (selected) drawMothershipSelectionBrackets(parts.overlay, elapsedSeconds);
  }

  /** @param {number} angle */
  function drumSurfaceAt(angle) {
    return { y: Math.sin(angle) * 16.5, depth: Math.cos(angle) };
  }

  /** @param {number} color @param {number} factor */
  function shadeMechanicalColor(color, factor) {
    /** @param {number} shift */
    var channel = function (shift) {
      return Math.max(0, Math.min(255, Math.round(((color >> shift) & 255) * factor)));
    };
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
  }

  /** @param {number} shipRotation */
  function mothershipLocalLight(shipRotation) {
    var c = Math.cos(shipRotation), s = Math.sin(shipRotation);
    return { x: WORLD_LIGHT.x * c + WORLD_LIGHT.y * s,
      y: -WORLD_LIGHT.x * s + WORLD_LIGHT.y * c, z: WORLD_LIGHT.z };
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds @param {number} shipRotation */
  function drawMothershipHabitat(graphics, elapsedSeconds, shipRotation) {
    var light = mothershipLocalLight(shipRotation);
    graphics.lineStyle(0);
    graphics.beginFill(0x55636d, 1);
    graphics.drawRoundedRect(-36, -17, 72, 34, 5);
    graphics.endFill();

    // Horizontal strips describe a lit cylinder while preserving the old silhouette.
    for (var y = -16; y < 17; y += 2) {
      var normalY = (y + 1) / 17;
      var normalZ = Math.sqrt(Math.max(0, 1 - normalY * normalY));
      var diffuse = Math.max(0, normalY * light.y + normalZ * light.z);
      var halfWidth = mothershipHullHalfWidthAtY(y + 1);
      graphics.beginFill(shadeMechanicalColor(SHIP_STYLES.mothership.fill, 0.61 + diffuse * 0.55), 1);
      graphics.drawRect(-halfWidth, y, halfWidth * 2, 2.15);
      graphics.endFill();
    }

    drawMothershipDrumSurface(graphics, elapsedSeconds);
    drawMothershipLights(graphics, elapsedSeconds);
    graphics.lineStyle(1.3, 0x354650, 0.72);
    [-25, -15, 15, 25].forEach(function (x) {
      graphics.moveTo(x, -15.5);
      graphics.lineTo(x, 15.5);
    });

    // One deliberately asymmetric service panel makes the drum's motion legible.
    var service = drumSurfaceAt(elapsedSeconds * Math.PI * 2 / 38 + 0.72);
    if (service.depth > 0) {
      graphics.lineStyle(0.8, 0xe7c36f, 0.75 * service.depth);
      graphics.beginFill(0x39464d, 0.7 * service.depth);
      graphics.drawRoundedRect(18, service.y - 2, 9, 4, 1);
      graphics.endFill();
      graphics.moveTo(20, service.y); graphics.lineTo(25, service.y);
    }

    graphics.lineStyle(0.65, 0x1d2b33, 0.62);
    graphics.beginFill(SHIP_STYLES.mothership.fill, 0);
    graphics.drawRoundedRect(-36, -17, 72, 34, 5);
    graphics.endFill();
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds */
  function drawMothershipBearing(graphics, elapsedSeconds) {
    graphics.lineStyle(0.7, 0x101a20, 0.8);
    graphics.beginFill(0x142129, 1);
    graphics.drawRoundedRect(-12, -19, 24, 38, 3);
    graphics.endFill();
    graphics.lineStyle(1.1, 0x8fcfc5, 0.8);
    graphics.beginFill(0x33434c, 1);
    graphics.drawRoundedRect(-11, -15, 22, 5, 1.5);
    graphics.drawRoundedRect(-11, 10, 22, 5, 1.5);
    graphics.endFill();
    var travel = (elapsedSeconds * 4.5) % 16;
    [-1, 1].forEach(function (side) {
      graphics.beginFill(0xb9f3dc, 0.85);
      graphics.drawCircle(-8 + travel, side * 12.5, 0.9);
      graphics.endFill();
    });
  }

  /** @param {PIXI.Graphics} graphics @param {number} shipRotation */
  function drawMothershipCore(graphics, shipRotation) {
    var light = mothershipLocalLight(shipRotation);
    var coreFill = shadeMechanicalColor(0x657680, 0.82 + Math.max(0, light.x) * 0.18);
    graphics.lineStyle(0.75, 0x1b2a32, 0.72);
    graphics.beginFill(coreFill, 1);
    graphics.drawRoundedRect(-8.5, -29, 17, 58, 2.5);
    graphics.endFill();
    graphics.lineStyle(0.65, 0xb9cbd1, 0.38);
    graphics.moveTo(-7, -26); graphics.lineTo(-7, 25);
    graphics.lineStyle(1, 0x17242b, 0.65);
    graphics.moveTo(7, -25); graphics.lineTo(7, 26);
    graphics.lineStyle(1, 0x25343d, 0.8);
    graphics.moveTo(-4.5, -27); graphics.lineTo(-4.5, 27);
    graphics.moveTo(4.5, -27); graphics.lineTo(4.5, 27);

    [-21, 21].forEach(function (y) {
      graphics.beginFill(0x172932, 1);
      graphics.drawRoundedRect(-5.5, y - 4, 11, 8, 2);
      graphics.endFill();
      graphics.lineStyle(1, 0x9cb8c2, 0.7);
      graphics.moveTo(-3.5, y); graphics.lineTo(3.5, y);
    });
    graphics.lineStyle(1.2, 0x92aab3, 0.8);
    graphics.moveTo(0, -29); graphics.lineTo(0, -35);
    graphics.moveTo(0, -35); graphics.lineTo(5, -39);
    graphics.beginFill(0xb9f3dc, 0.9);
    graphics.drawCircle(5, -39, 1.2);
    graphics.endFill();
    graphics.lineStyle(1, 0x78909a, 0.9);
    graphics.beginFill(0x2b3d46, 1);
    graphics.drawRect(-15, -25, 6, 10);
    graphics.drawRect(9, 15, 6, 10);
    graphics.endFill();
    graphics.lineStyle(0.7, 0x9db3bc, 0.55);
    graphics.moveTo(-13, -24); graphics.lineTo(-13, -16);
    graphics.moveTo(11, 16); graphics.lineTo(11, 24);
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds */
  function drawMothershipSelectionBrackets(graphics, elapsedSeconds) {
    var alpha = 0.68 + Math.sin(elapsedSeconds * 3.2) * 0.12;
    var left = -42, right = 42, top = -43, bottom = 43, length = 8;
    graphics.lineStyle(1.1, 0xd9f5ff, alpha);
    [[left, top, 1, 1], [right, top, -1, 1],
      [left, bottom, 1, -1], [right, bottom, -1, -1]].forEach(function (corner) {
      graphics.moveTo(corner[0], corner[1] + corner[3] * length);
      graphics.lineTo(corner[0], corner[1]);
      graphics.lineTo(corner[0] + corner[2] * length, corner[1]);
    });
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds */
  function drawMothershipDrumSurface(graphics, elapsedSeconds) {
    var bands = mothershipDrumMarkers(elapsedSeconds);
    bands.forEach(function (band) {
      if (!band.visible) return;
      graphics.lineStyle(band.width, 0xbdd9e4, band.alpha);
      graphics.moveTo(-band.halfWidth, band.y);
      graphics.lineTo(band.halfWidth, band.y);
    });
  }

  /** @param {number} elapsedSeconds */
  function mothershipDrumMarkers(elapsedSeconds) {
    var spin = elapsedSeconds * Math.PI * 2 / 38;
    /** @type {{y: number; halfWidth: number; width: number; alpha: number; visible: boolean}[]} */
    var markers = [];
    for (var i = 0; i < 6; i += 1) {
      var phase = spin + i * Math.PI / 3;
      var surface = drumSurfaceAt(phase);
      var y = surface.y;
      // Depth hides the underside; the exposed surface spans both screen halves.
      var depth = surface.depth;
      var facing = Math.max(0, depth);
      markers.push({
        y: y,
        halfWidth: mothershipHullHalfWidthAtY(y),
        width: 0.55 + facing * 0.55,
        alpha: facing * 0.32,
        visible: depth > 0
      });
    }
    return markers;
  }

  /** @param {number} y */
  function mothershipHullHalfWidthAtY(y) {
    var absY = Math.abs(y);
    if (absY <= 12) return 36;
    var cornerInset = absY - 12;
    return 31 + Math.sqrt(Math.max(0, 25 - cornerInset * cornerInset));
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds */
  function drawMothershipLights(graphics, elapsedSeconds) {
    var spin = elapsedSeconds * Math.PI * 2 / 38;
    var xPositions = [-26, 26];
    graphics.lineStyle(0);
    xPositions.forEach(function (x, xIndex) {
      for (var i = 0; i < 2; i += 1) {
        var phase = spin + i * Math.PI + xIndex * 0.24;
        var surface = drumSurfaceAt(phase);
        var y = surface.y * 15 / 16.5;
        var depth = surface.depth;
        if (depth <= 0) continue;
        var near = depth * 0.9;
        graphics.beginFill(0xbdd9e4, near);
        graphics.drawCircle(x, y, 1.6 + near * 0.9);
        graphics.endFill();
      }
    });
  }

  /** @param {PIXI.Graphics} graphics @param {Ship} ship @param {number} radius @param {number} elapsedSeconds */
  function drawEnginePlume(graphics, ship, radius, elapsedSeconds) {
    if (ship.disabled || !ship.previousVelocity || ship.speed <= 0 || ('phase' in ship.order && ship.order.phase === 'landed')) {
      graphics.engineResponse = null;
      return;
    }
    var ax = ship.velocity.x - ship.previousVelocity.x;
    var ay = ship.velocity.y - ship.previousVelocity.y;
    var plumes = enginePlumeGeometry(ax, ay, ship.rotation, ship.acceleration, radius, ship.order.kind === 'return' && ship.cargo > 0, ship.type);
    if (!plumes.length) {
      graphics.engineResponse = null;
      return;
    }

    var fighter = ship.type === 'escort';
    var time = elapsedSeconds || 0;
    var response = graphics.engineResponse && time >= graphics.engineResponse.time
      ? graphics.engineResponse : { time: time, levels: {} };
    var dt = Math.max(0, Math.min(0.1, time - response.time));
    /** @type {Record<string, number>} */
    var levels = {};
    var seed = 0;
    for (var i = 0; i < ship.id.length; i += 1) seed = (seed * 31 + ship.id.charCodeAt(i)) >>> 0;
    graphics.lineStyle(0);
    plumes.forEach(function (plume, index) {
      var previous = response.levels[plume.id];
      var level = previous == null ? 0.55 : previous;
      level += (1 - level) * (1 - Math.exp(-dt / (fighter ? 0.035 : 0.22)));
      levels[plume.id] = level;
      var phase = time * (fighter ? 24 : 7) + seed % 997 + index * 2.4;
      var pulse = Math.sin(phase) * 0.65 + Math.sin(phase * 1.73) * 0.35;
      var length = plume.length * (0.65 + level * 0.35) * (1 + pulse * (fighter ? 0.075 : 0.025));
      var alpha = plume.alpha * (0.7 + level * 0.3);
      drawPlumeDiamond(graphics, plume, 0, length * 0.16, length, plume.width, 0x73c9c1, alpha * 0.48);
      drawPlumeDiamond(graphics, plume, 0, length * 0.1, length * 0.84, plume.width * 0.48, 0x9fe9df, alpha * 0.72);
      drawPlumeDiamond(graphics, plume, 0, length * 0.06, length * 0.67, plume.width * 0.16, 0xe5fff3, alpha * 1.35);
      // Tiny distant exhaust keeps its silhouette without subpixel bands.
      if (length * Math.abs(graphics.engineScreenScale || graphics.scale.x) >= 10) {
        for (var node = 0; node < 3; node += 1) {
          var center = length * (0.2 + node * 0.2 + pulse * 0.008);
          var halfLength = length * (0.065 - node * 0.01);
          drawPlumeDiamond(graphics, plume, center - halfLength, center, center + halfLength,
            plume.width * (0.3 - node * 0.065), 0xeafff4, alpha * (1.3 - node * 0.23));
        }
      }
    });
    graphics.engineResponse = { time: time, levels: levels };
  }

  /** @param {PIXI.Graphics} graphics @param {Plume} plume @param {number} start @param {number} center @param {number} end @param {number} width @param {number} color @param {number} alpha */
  function drawPlumeDiamond(graphics, plume, start, center, end, width, color, alpha) {
    var x = plume.origin.x;
    var y = plume.origin.y;
    var dx = plume.direction.x;
    var dy = plume.direction.y;
    graphics.beginFill(color, Math.min(1, alpha));
    graphics.moveTo(x + dx * start, y + dy * start);
    graphics.lineTo(x + dx * center + plume.side.x * width, y + dy * center + plume.side.y * width);
    graphics.lineTo(x + dx * end, y + dy * end);
    graphics.lineTo(x + dx * center - plume.side.x * width, y + dy * center - plume.side.y * width);
    graphics.closePath();
    graphics.endFill();
  }

  /** @param {number} worldAccelX @param {number} worldAccelY @param {number} rotation @param {number} acceleration @param {number} radius @param {boolean} loadedReturn @param {string} shipType */
  function enginePlumeGeometry(worldAccelX, worldAccelY, rotation, acceleration, radius, loadedReturn, shipType) {
    var accel = Math.hypot(worldAccelX, worldAccelY);
    if (accel < 0.18) return [];

    var local = worldDeltaToShipLocal(worldAccelX, worldAccelY, rotation);
    /** @type {Plume[]} */
    var plumes = [];
    addThrusterPlume(plumes, 'main-aft', Math.max(0, local.x), acceleration, radius, { x: -0.82, y: 0 }, { x: -1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'brake-port', Math.max(0, -local.x), acceleration, radius, { x: 0.72, y: -0.42 }, { x: 1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'brake-starboard', Math.max(0, -local.x), acceleration, radius, { x: 0.72, y: 0.42 }, { x: 1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'port-translate', Math.max(0, local.y), acceleration, radius, { x: -0.2, y: -0.82 }, { x: 0, y: -1 }, loadedReturn);
    addThrusterPlume(plumes, 'starboard-translate', Math.max(0, -local.y), acceleration, radius, { x: -0.2, y: 0.82 }, { x: 0, y: 1 }, loadedReturn);
    if (shipType === 'tug') {
      plumes.forEach(function (plume) {
        var constructor = shipType === 'tug';
        if (plume.id === 'main-aft') {
          plume.origin.x = -(constructor ? 0.9 : 0.86) * radius;
        } else if (plume.id.indexOf('brake-') === 0) {
          plume.origin.x = (constructor ? 0.9 : 0.82) * radius;
          plume.origin.y = Math.sign(plume.origin.y) * (constructor ? 0.16 : 0.3) * radius;
        } else {
          plume.origin.x = (constructor ? -0.58 : 0) * radius;
          plume.origin.y = Math.sign(plume.origin.y) * (constructor ? 0.96 : 0.83) * radius;
        }
      });
    }
    return plumes;
  }

  /** @param {Plume[]} plumes @param {string} id @param {number} thrust @param {number} acceleration @param {number} radius @param {Vec2} originScale @param {Vec2} direction @param {boolean} loadedReturn */
  function addThrusterPlume(plumes, id, thrust, acceleration, radius, originScale, direction, loadedReturn) {
    if (thrust < 0.12) return;
    var intensity = Math.min(1, thrust / Math.max(1, acceleration / 24));
    var normalized = normalize(direction);
    plumes.push({
      id: id,
      origin: { x: radius * originScale.x, y: radius * originScale.y },
      direction: normalized,
      side: { x: -normalized.y, y: normalized.x },
      length: (4 + 13 * intensity) * (loadedReturn ? 1.08 : 1),
      width: 1.5 + 2.8 * intensity,
      alpha: 0.1 + 0.36 * intensity
    });
  }

  /** @param {PIXI.Graphics} graphics @param {Ship} ship */
  function drawWorldOrderLine(graphics, ship) {
    if (!('target' in ship.order) || !ship.order.target) return;
    var local = worldVectorToShipLocalLine(ship.position, ship.order.target, ship.rotation);
    graphics.moveTo(0, 0);
    graphics.lineTo(local.x / graphics.scale.x, local.y / graphics.scale.y);
  }

  /** @param {Vec2} position @param {Vec2} target @param {number} rotation */
  function worldVectorToShipLocalLine(position, target, rotation) {
    var dx = target.x - position.x;
    var dy = target.y - position.y;
    var cos = Math.cos(-rotation);
    var sin = Math.sin(-rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  /** @param {number} dx @param {number} dy @param {number} rotation */
  function worldDeltaToShipLocal(dx, dy, rotation) {
    var cos = Math.cos(-rotation);
    var sin = Math.sin(-rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  /** @param {Vec2} vector */
  function normalize(vector) {
    var length = Math.max(0.0001, Math.hypot(vector.x, vector.y));
    return {
      x: vector.x / length,
      y: vector.y / length
    };
  }

  // Same schematic metres-to-artwork ratio as a carried module, at every zoom.
  function cargoModuleGeometry() {
    return { length: sim.DEPOT_SECTION.lengthM * 0.45, width: sim.DEPOT_SECTION.widthM * 0.45 };
  }

  Driftworks.shipArt = {
    styles: SHIP_STYLES,
    cargoModuleGeometry: cargoModuleGeometry,
    craftDetail: craftDetail,
    createMothershipGraphic: createMothershipGraphic,
    drawCraftBrackets: drawCraftBrackets,
    drawEnginePlume: drawEnginePlume,
    drawPlatformWorkers: drawPlatformWorkers,
    drumSurfaceAt: drumSurfaceAt,
    enginePlumeGeometry: enginePlumeGeometry,
    mothershipDrumMarkers: mothershipDrumMarkers,
    mothershipHabitatLampVisibility: mothershipHabitatLampVisibility,
    mothershipHabitatUniforms: mothershipHabitatUniforms,
    mothershipHullHalfWidthAtY: mothershipHullHalfWidthAtY,
    mothershipLocalLight: mothershipLocalLight,
    paintIndustrialPlatform: paintIndustrialPlatform,
    paintRaisedPlatform: paintRaisedPlatform,
    paintShip: paintShip,
    paintTerrainPlatform: paintTerrainPlatform,
    platformDeployment: platformDeployment,
    platformIsWorking: platformIsWorking,
    platformProjection: platformProjection,
    platformRaisedPoint: platformRaisedPoint,
    platformSurfaceNormal: platformSurfaceNormal,
    semanticScale: semanticScale,
    worldDeltaToShipLocal: worldDeltaToShipLocal,
    worldVectorToShipLocalLine: worldVectorToShipLocalLine
  };
})(window);
