import { batchGameOptions } from '../../engine/seasonProgress';
import { useMemo, useState } from 'react';
import { gameDayToDate } from '../../utils';
import { SEASON_GAMES } from '../../constants';
import { Button } from '../design-system/primitives';

export default function HubSimPanel({ gameDay, schedule, remain, canSim = false, batchProgress, onStartGame, onBatchSim, onSeasonSim }) {
  const [batchCount,setBatchCount] = useState(5);
  const [batchAutoManage,setBatchAutoManage] = useState(false);
  const [seasonAutoManage,setSeasonAutoManage] = useState(false);
  const options = useMemo(()=>batchGameOptions(remain),[remain]);
  const disabled = Boolean(batchProgress) || !canSim || !options.length;
  const count = options.includes(batchCount) ? batchCount : options[0] ?? 0;
  return <div className="flow-sim-panel home-sim-panel" data-ds="sim">
    <Button variant="secondary" disabled={disabled} onClick={onStartGame}>1試合</Button>
    <div className="home-sim-group">
      <label className="home-count">まとめて進める試合数<select aria-label="まとめて進める試合数" disabled={disabled} value={count} onChange={event=>setBatchCount(Number(event.target.value))}>
        {!options.length && <option value={0}>実行可能な試合なし</option>}
        {options.map(value=>{const date=schedule?.[Math.min(gameDay+value-1,SEASON_GAMES)] ? gameDayToDate(Math.min(gameDay+value-1,SEASON_GAMES),schedule) : null;return <option key={value} value={value}>{value}試合{date ? ` (${date.month}/${date.day})` : ''}</option>;})}
      </select></label>
      <label className="home-check"><input type="checkbox" checked={batchAutoManage} disabled={disabled} onChange={event=>setBatchAutoManage(event.target.checked)}/>フル自動編成</label>
      <Button disabled={disabled} onClick={()=>onBatchSim(count,batchAutoManage)}>まとめてシム</Button>
    </div>
    <div className="home-sim-group">
      <label className="home-check"><input type="checkbox" checked={seasonAutoManage} disabled={disabled} onChange={event=>setSeasonAutoManage(event.target.checked)}/>フル自動編成</label>
      <Button variant="secondary" disabled={disabled} onClick={()=>onSeasonSim(seasonAutoManage)}>残り全{remain}試合</Button>
    </div>
  </div>;
}
