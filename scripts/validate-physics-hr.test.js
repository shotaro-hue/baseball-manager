import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { _resolveBattedBallOutcomeFromPhysics_TEST } from '../src/engine/simulation';

describe('Monte Carlo HR Validation', () => {
  it('power別HR/BIPとquality分布を集計する', () => {
    const TOTAL_PA = 20000;
    const STADIUM = { lf: 100, cf: 122, rf: 100 };
    const PITCHER = { pitching: { velocity: 60, breaking: 60, control: 60 } };
    const profiles = [
      { label: 'power70', batting: { power: 70, contact: 55, eye: 50, speed: 50 } },
      { label: 'power80', batting: { power: 80, contact: 58, eye: 50, speed: 50 } },
      { label: 'power90', batting: { power: 90, contact: 60, eye: 50, speed: 50 } },
    ];

    const results = profiles.map((profile) => {
      const counter = { pa: 0, bip: 0, hr: 0, evSum: 0, laSum: 0, distSum: 0, quality: { weak: 0, normal: 0, solid: 0, hard: 0, barrel: 0 } };
      for (let i = 0; i < TOTAL_PA; i += 1) {
        counter.pa += 1;
        const resolved = _resolveBattedBallOutcomeFromPhysics_TEST({ batting: profile.batting }, PITCHER, STADIUM, { windOut: 0 }, {});
        const meta = resolved.physicsMeta;
        counter.bip += 1;
        if (resolved.result === 'hr') counter.hr += 1;
        counter.evSum += Number(meta.ev) || 0;
        counter.laSum += Number(meta.la) || 0;
        counter.distSum += Number(meta.distance) || 0;
        const q = ['weak', 'normal', 'solid', 'hard', 'barrel'].includes(meta.quality) ? meta.quality : 'normal';
        counter.quality[q] += 1;
      }
      return {
        profile: profile.label,
        hrPerBip: counter.hr / Math.max(counter.bip, 1),
        hrPerPa: counter.hr / Math.max(counter.pa, 1),
        teamHrPerGame: (counter.hr / Math.max(counter.pa, 1)) * 38,
        avgEv: counter.evSum / Math.max(counter.bip, 1),
        avgLa: counter.laSum / Math.max(counter.bip, 1),
        avgDistance: counter.distSum / Math.max(counter.bip, 1),
        qualityRate: Object.fromEntries(Object.entries(counter.quality).map(([k, v]) => [k, v / Math.max(counter.bip, 1)])),
      };
    });

    const outputPath = resolve('scripts/physics-hr-report.json');
    writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
    console.log('Monte Carlo結果:', JSON.stringify(results, null, 2));

    expect(results.length).toBe(3);
  });
});
