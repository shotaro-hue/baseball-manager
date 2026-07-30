import { describe, expect, it } from 'vitest';
import { isBarreledBattedBall } from '../barrelClassification.js';
import {
  createEmptyBattedBallProfile,
  updateBattedBallProfile,
} from '../battedBallProfile.js';

const toKmh = (mph) => mph * 1.609344;

describe('barrel classification', () => {
  it('classifies the 98 mph barrel window as 26–30 degrees', () => {
    expect(isBarreledBattedBall(toKmh(98), 26)).toBe(true);
    expect(isBarreledBattedBall(toKmh(98), 30)).toBe(true);
    expect(isBarreledBattedBall(toKmh(98), 25.9)).toBe(false);
    expect(isBarreledBattedBall(toKmh(98), 30.1)).toBe(false);
  });

  it('widens the barrel window to 24–33 degrees at 100 mph', () => {
    expect(isBarreledBattedBall(toKmh(100), 24)).toBe(true);
    expect(isBarreledBattedBall(toKmh(100), 33)).toBe(true);
    expect(isBarreledBattedBall(toKmh(100), 23.9)).toBe(false);
    expect(isBarreledBattedBall(toKmh(100), 33.1)).toBe(false);
  });

  it('caps the barrel window at 8–50 degrees from 116 mph', () => {
    expect(isBarreledBattedBall(toKmh(116), 8)).toBe(true);
    expect(isBarreledBattedBall(toKmh(120), 50)).toBe(true);
    expect(isBarreledBattedBall(toKmh(120), 50.1)).toBe(false);
  });

  it('rejects sub-threshold speed and invalid values', () => {
    expect(isBarreledBattedBall(toKmh(97.99), 28)).toBe(false);
    expect(isBarreledBattedBall(Number.NaN, 28)).toBe(false);
    expect(isBarreledBattedBall(toKmh(100), undefined)).toBe(false);
  });

  it('recalculates legacy compact logs from exit velocity and angle', () => {
    const profile = updateBattedBallProfile(createEmptyBattedBallProfile(), {
      result: 'out',
      evKmh: toKmh(100),
      laDeg: 28,
      sprayAngleDeg: 45,
      contactQuality: null,
    });

    expect(profile.bip).toBe(1);
    expect(profile.barrel).toBe(1);
  });

  it('uses measured values instead of a stale quality label', () => {
    const profile = updateBattedBallProfile(createEmptyBattedBallProfile(), {
      result: 'out',
      evKmh: toKmh(90),
      laDeg: 28,
      sprayAngleDeg: 45,
      contactQuality: 'barrel',
    });

    expect(profile.bip).toBe(1);
    expect(profile.barrel).toBe(0);
  });
});
