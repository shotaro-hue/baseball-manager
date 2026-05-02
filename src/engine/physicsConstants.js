export const PHYSICS_PRESETS = {
  sim: {
    gravity: 9.81,
    dragCoeff: 0.0036, // 現実寄りの失速に寄せるため空気抵抗を増加
    dt: 0.01,
    maxSteps: 12000,
    sampleInterval: 5,
    releaseHeight: 1,
  },
};

export const DEFAULT_PHYSICS_PRESET = 'sim';


export const DEFAULT_ENVIRONMENT = {
  windOut: 0,
  airDensity: 1.225,
  temperatureC: 20,
  altitudeM: 0,
};
