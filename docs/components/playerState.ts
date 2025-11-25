import { Vector3 } from 'three';

// --- 火焰狀態參數（可調） ---
// fireRadius: 火焰碰撞判定半徑；更新頻率在 Player 中
export const playerActionState = {
  fireCenters: [] as Vector3[],
  fireRadius: 1.8,
  fireActive: false,
};

export const updatePlayerFireState = (centers: Vector3[], radius: number, active: boolean) => {
  playerActionState.fireCenters = centers;
  playerActionState.fireRadius = radius;
  playerActionState.fireActive = active;
};
