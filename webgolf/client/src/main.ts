import './style.css';
import { GameApp } from './game/GameApp.js';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const overlay = document.querySelector<HTMLElement>('#overlay');

if (!canvas || !overlay) {
  throw new Error('Missing #game-canvas or #overlay');
}

new GameApp(canvas, overlay);
