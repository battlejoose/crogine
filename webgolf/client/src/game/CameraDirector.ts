import * as THREE from 'three';
import { COURSE } from '@webgolf/shared';

export type CameraMode = 'intro' | 'aim' | 'flight' | 'settle' | 'transition' | 'scoreboard';

type AimTarget = {
  ball: THREE.Vector3;
  yaw: number;
};

export class CameraDirector {
  mode: CameraMode = 'intro';
  /** SVG putt camera: lower height / closer offset */
  putting = false;
  private introT = 0;
  private transitionT = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private lookFrom = new THREE.Vector3();
  private lookTo = new THREE.Vector3();
  private flightLook = new THREE.Vector3();
  private aim: AimTarget = {
    ball: new THREE.Vector3(),
    yaw: 0,
  };

  constructor(private camera: THREE.PerspectiveCamera) {
    this.camera.fov = 42;
    this.camera.near = 0.1;
    this.camera.far = 400;
  }

  startIntro() {
    this.mode = 'intro';
    this.introT = 0;
  }

  setAim(ball: THREE.Vector3, yaw: number) {
    this.mode = 'aim';
    this.aim.ball.copy(ball);
    this.aim.yaw = yaw;
  }

  updateAimYaw(yaw: number) {
    this.aim.yaw = yaw;
  }

  startFlight(ball: THREE.Vector3) {
    this.mode = 'flight';
    this.flightLook.copy(ball);
  }

  followFlight(ball: THREE.Vector3) {
    this.flightLook.copy(ball);
  }

  startSettle(ball: THREE.Vector3) {
    this.mode = 'settle';
    this.to.copy(ball);
  }

  startTransition(fromBall: THREE.Vector3, toBall: THREE.Vector3) {
    this.mode = 'transition';
    this.transitionT = 0;
    this.from.copy(this.camera.position);
    this.lookFrom.copy(fromBall);
    this.lookTo.copy(toBall);
    // destination camera pose (behind ball toward pin)
    const toPin = new THREE.Vector3(
      COURSE.pin.x - toBall.x,
      0,
      COURSE.pin.z - toBall.z,
    ).normalize();
    this.to.copy(toBall).addScaledVector(toPin, -6).add(new THREE.Vector3(0, 2.4, 0));
  }

  startScoreboard() {
    this.mode = 'scoreboard';
  }

  update(dt: number) {
    switch (this.mode) {
      case 'intro':
        this.updateIntro(dt);
        break;
      case 'aim':
        this.updateAim();
        break;
      case 'flight':
        this.updateFlight();
        break;
      case 'settle':
        this.updateSettle();
        break;
      case 'transition':
        this.updateTransition(dt);
        break;
      case 'scoreboard':
        this.updateScoreboard(dt);
        break;
    }
    this.camera.updateProjectionMatrix();
  }

  private updateIntro(dt: number) {
    this.introT = Math.min(1, this.introT + dt / 5.5);
    const t = easeInOut(this.introT);
    const tee = new THREE.Vector3(COURSE.tee.x, 1.2, COURSE.tee.z + 4);
    const green = new THREE.Vector3(COURSE.pin.x, 8, COURSE.pin.z + 18);
    this.camera.position.lerpVectors(tee, green, t);
    const look = new THREE.Vector3(
      THREE.MathUtils.lerp(COURSE.tee.x, COURSE.pin.x, t),
      THREE.MathUtils.lerp(0.5, COURSE.green.height, t),
      THREE.MathUtils.lerp(COURSE.tee.z - 10, COURSE.pin.z, t),
    );
    this.camera.lookAt(look);
  }

  private updateAim() {
    const { ball, yaw } = this.aim;
    const dist = this.putting ? 1.6 : 5.5;
    const height = this.putting ? 0.6 : 2.1;
    const lookAhead = this.putting ? 3 : 8;
    const back = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(-dist);
    const pos = ball.clone().add(back);
    pos.y = ball.y + height;
    this.camera.position.lerp(pos, 0.12);
    const look = ball.clone();
    look.y += this.putting ? 0.1 : 0.3;
    look.x += Math.sin(yaw) * lookAhead;
    look.z += -Math.cos(yaw) * lookAhead;
    this.camera.lookAt(look);
  }

  private updateFlight() {
    const ball = this.flightLook;
    const behind = this.camera.position.clone().sub(ball).setY(0);
    if (behind.lengthSq() < 0.01) behind.set(0, 0, 1);
    behind.normalize().multiplyScalar(7);
    const desired = ball.clone().add(behind);
    desired.y = ball.y + 3.2;
    this.camera.position.lerp(desired, 0.08);
    this.camera.lookAt(ball.x, ball.y + 0.4, ball.z);
  }

  private updateSettle() {
    const ball = this.to;
    const desired = new THREE.Vector3(ball.x + 3.5, ball.y + 2.8, ball.z + 4.5);
    this.camera.position.lerp(desired, 0.06);
    this.camera.lookAt(ball.x, ball.y + 0.2, ball.z);
  }

  private updateTransition(dt: number) {
    this.transitionT = Math.min(1, this.transitionT + dt / 1.8);
    const t = easeInOut(this.transitionT);
    this.camera.position.lerpVectors(this.from, this.to, t);
    const look = new THREE.Vector3().lerpVectors(this.lookFrom, this.lookTo, t);
    look.y += 0.4;
    this.camera.lookAt(look);
  }

  private updateScoreboard(dt: number) {
    const center = new THREE.Vector3(COURSE.pin.x, COURSE.green.height + 4, COURSE.pin.z + 16);
    this.camera.position.lerp(center, 0.04);
    this.camera.lookAt(COURSE.pin.x, COURSE.green.height, COURSE.pin.z);
    this.camera.position.x += Math.sin(performance.now() * 0.0003) * dt * 2;
  }

  get introComplete() {
    return this.introT >= 1;
  }

  get transitionComplete() {
    return this.transitionT >= 1;
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
