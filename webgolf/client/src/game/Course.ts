import * as THREE from 'three';
import { COURSE, HOLE_RADIUS, groundHeight, pointInRect } from '@webgolf/shared';

const textureLoader = new THREE.TextureLoader();

function loadTiledTexture(url: string, repeat = 8): THREE.Texture {
  const tex = textureLoader.load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Visual course built to match shared terrainAt / groundHeight.
 * Fairway mesh skips water cells so banners match what you see.
 */
export class CourseView {
  readonly group = new THREE.Group();
  readonly pinWorld = new THREE.Vector3(
    COURSE.pin.x,
    COURSE.green.height + 0.05,
    COURSE.pin.z,
  );
  readonly teeWorld = new THREE.Vector3(COURSE.tee.x, COURSE.tee.y, COURSE.tee.z);

  constructor(scene: THREE.Scene) {
    this.group.name = 'course';
    scene.add(this.group);
    this.buildRough();
    this.buildFairway();
    this.buildGreen();
    this.buildHazards();
    this.buildTee();
    this.buildPin();
    this.buildAtmosphere(scene);
  }

  private buildRough() {
    const roughMat = new THREE.MeshStandardMaterial({
      map: loadTiledTexture('/assets/rough.png', 10),
      color: new THREE.Color('#3d5c32'),
      roughness: 0.95,
    });
    const rough = new THREE.Mesh(
      new THREE.PlaneGeometry(
        COURSE.rough.maxX - COURSE.rough.minX,
        COURSE.rough.maxZ - COURSE.rough.minZ,
      ),
      roughMat,
    );
    rough.rotation.x = -Math.PI / 2;
    rough.position.set(
      (COURSE.rough.minX + COURSE.rough.maxX) / 2,
      -0.02,
      (COURSE.rough.minZ + COURSE.rough.maxZ) / 2,
    );
    rough.receiveShadow = true;
    this.group.add(rough);
  }

  private buildFairway() {
    const fairwayMat = new THREE.MeshStandardMaterial({
      map: loadTiledTexture('/assets/fairway.png', 8),
      color: new THREE.Color('#4a9a55'),
      roughness: 0.85,
    });

    // Heightfield grid — skip water cells so water isn't "fairway" visually
    const segsX = 48;
    const segsZ = 96;
    const { fairway } = COURSE;
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    const xs: number[] = [];
    const zs: number[] = [];
    for (let iz = 0; iz <= segsZ; iz++) {
      zs.push(fairway.minZ + ((fairway.maxZ - fairway.minZ) * iz) / segsZ);
    }
    for (let ix = 0; ix <= segsX; ix++) {
      xs.push(fairway.minX + ((fairway.maxX - fairway.minX) * ix) / segsX);
    }

    const idxMap = new Map<string, number>();
    const key = (ix: number, iz: number) => `${ix},${iz}`;

    for (let iz = 0; iz <= segsZ; iz++) {
      for (let ix = 0; ix <= segsX; ix++) {
        const x = xs[ix];
        const z = zs[iz];
        if (pointInRect(x, z, COURSE.water)) continue;
        // Leave green disc to green mesh
        const toGreen = Math.hypot(x - COURSE.green.center.x, z - COURSE.green.center.z);
        if (toGreen <= COURSE.green.radius - 0.2) continue;

        idxMap.set(key(ix, iz), positions.length / 3);
        positions.push(x, groundHeight(x, z), z);
        uvs.push(ix / segsX, iz / segsZ);
      }
    }

    for (let iz = 0; iz < segsZ; iz++) {
      for (let ix = 0; ix < segsX; ix++) {
        const a = idxMap.get(key(ix, iz));
        const b = idxMap.get(key(ix + 1, iz));
        const c = idxMap.get(key(ix, iz + 1));
        const d = idxMap.get(key(ix + 1, iz + 1));
        if (a == null || b == null || c == null || d == null) continue;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, fairwayMat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildGreen() {
    const greenMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5cb86a'),
      roughness: 0.65,
    });

    // Ring green with cup hole
    const shape = new THREE.Shape();
    shape.absarc(0, 0, COURSE.green.radius, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, HOLE_RADIUS, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const geo = new THREE.ShapeGeometry(shape, 48);
    const green = new THREE.Mesh(geo, greenMat);
    green.rotation.x = -Math.PI / 2;
    green.position.set(COURSE.green.center.x, COURSE.green.height, COURSE.green.center.z);
    green.receiveShadow = true;
    this.group.add(green);

    // Cup interior
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(HOLE_RADIUS * 0.98, HOLE_RADIUS * 0.98, 0.12, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: '#111', roughness: 1, side: THREE.DoubleSide }),
    );
    cup.position.set(COURSE.pin.x, COURSE.green.height - 0.06, COURSE.pin.z);
    this.group.add(cup);

    const cupBottom = new THREE.Mesh(
      new THREE.CircleGeometry(HOLE_RADIUS * 0.98, 24),
      new THREE.MeshStandardMaterial({ color: '#0a0a0a' }),
    );
    cupBottom.rotation.x = -Math.PI / 2;
    cupBottom.position.set(COURSE.pin.x, COURSE.green.height - 0.12, COURSE.pin.z);
    this.group.add(cupBottom);
  }

  private buildTee() {
    const tee = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.08, 2.4),
      new THREE.MeshStandardMaterial({ color: '#6bc47a', roughness: 0.8 }),
    );
    tee.position.set(COURSE.tee.x, COURSE.tee.y, COURSE.tee.z);
    tee.receiveShadow = true;
    tee.castShadow = true;
    this.group.add(tee);
  }

  private buildHazards() {
    const waterMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1a5a6e'),
      roughness: 0.12,
      metalness: 0.4,
      transparent: true,
      opacity: 0.95,
    });
    const w = COURSE.water;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(w.maxX - w.minX, w.maxZ - w.minZ),
      waterMat,
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set((w.minX + w.maxX) / 2, w.surfaceY, (w.minZ + w.maxZ) / 2);
    this.group.add(water);

    const bunker = new THREE.Mesh(
      new THREE.CircleGeometry(COURSE.bunker.radius, 32),
      new THREE.MeshStandardMaterial({ color: '#c4a574', roughness: 1 }),
    );
    bunker.rotation.x = -Math.PI / 2;
    bunker.position.set(COURSE.bunker.center.x, -0.06, COURSE.bunker.center.z);
    bunker.receiveShadow = true;
    this.group.add(bunker);
  }

  private buildPin() {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.4 }),
    );
    pole.position.set(COURSE.pin.x, COURSE.green.height + 1.1, COURSE.pin.z);
    pole.castShadow = true;
    this.group.add(pole);

    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.45),
      new THREE.MeshStandardMaterial({
        color: '#ff6b4a',
        side: THREE.DoubleSide,
        roughness: 0.6,
      }),
    );
    flag.position.set(COURSE.pin.x + 0.38, COURSE.green.height + 1.9, COURSE.pin.z);
    this.group.add(flag);
  }

  private buildAtmosphere(scene: THREE.Scene) {
    scene.background = new THREE.Color('#87a8c4');
    scene.fog = new THREE.FogExp2('#9bb4c8', 0.012);

    scene.add(new THREE.HemisphereLight('#cfe6ff', '#3a4a28', 0.55));

    const sun = new THREE.DirectionalLight('#fff2d6', 1.35);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    scene.add(sun);

    const treeMat = new THREE.MeshStandardMaterial({ color: '#1e3a24', roughness: 1 });
    for (let i = 0; i < 28; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: '#3a2a18' }),
      );
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.4 + Math.random(), 3.2, 7), treeMat);
      const x = side * (22 + Math.random() * 12);
      const z = -10 - Math.random() * 110;
      trunk.position.set(x, 0.6, z);
      canopy.position.set(x, 2.4, z);
      trunk.castShadow = true;
      canopy.castShadow = true;
      this.group.add(trunk, canopy);
    }
  }
}
