import React from 'react';
import { MAX_SHIHAKA_TOTAL } from '../constants';

export function RosterCapacitySummary({ capacity, className = '' }) {
  return <p className={className} data-roster-capacity>
    {capacity?.ok ? <>支配下 {capacity.controlledCount}/{MAX_SHIHAKA_TOTAL}人 · 育成 {capacity.developmentCount}人 · 確定指名 {capacity.acceptedPickCount}人 · 実際の残枠 {capacity.remainingSlots}枠{capacity.overBy > 0 && <> · 上限超過 {capacity.overBy}人</>}</> : '支配下人数は未確認'}
  </p>;
}
