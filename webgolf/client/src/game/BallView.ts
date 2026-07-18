import * as THREE from 'three';
import { BALL_RADIUS, type PlayerPublic, type Vec3 } from '@webgolf/shared';

export class BallView {
  readonly mesh: THREE.Mesh;
  readonly playerId: string;

  constructor(player: PlayerPublic, scene: THREE.Scene) {
    this.playerId = player.id;
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 16, 12);
    const map = new THREE.TextureLoader().load('/assets/ball.png');
    map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map,
      color: new THREE.Color(player.color),
      roughness: 0.35,
      metalness: 0.05,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.setPosition(player.position);
    scene.add(this.mesh);
  }

  setPosition(p: Vec3) {
    this.mesh.position.set(p.x, p.y, p.z);
  }

  setVisible(v: boolean) {
    this.mesh.visible = v;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
