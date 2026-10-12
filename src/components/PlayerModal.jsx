import {FarmPlayerHistory} from './FarmRecordSummary';
import { useCallback, useId, useRef, useState } from "react";
import { CareerTable } from './tabs/CareerTable';
import { BattedBallAnalysisPanel } from './BattedBallAnalysisPanel';
import '../mobile-flow.css';
import { getFaProgress } from '../engine/contract';
import { Button, Section } from './design-system/primitives';
import { useResultDialog } from './useResultDialog';
import { detailNumber, detailRate, detailInnings, detailSalary, firstTeamScope, playerMembership } from './playerDetailMetrics';
import './player-detail.css';

/* ═══════════════════════════════════════════════
   PLAYER DETAIL MODAL
═══════════════════════════════════════════════ */

function abilityGrade(v){
  if(v>=90) return{g:"S",c:"#e879f9"};
  if(v>=80) return{g:"A",c:"#14714b"};
  if(v>=65) return{g:"B",c:"#805700"};
  if(v>=50) return{g:"C",c:"#53657c"};
  if(v>=35) return{g:"D",c:"#f97316"};
  return{g:"E",c:"#b42332"};
}

function AbilityBar({label, value}) {
  const recorded = Number.isFinite(value) && value >= 0;
  const grade = recorded ? abilityGrade(value).g : null;
  return <div className="player-ability">
    <div><span>{label}</span><strong>{grade && `${grade} · `}{detailNumber(value)}</strong></div>
    {recorded && <div className="player-ability-track" aria-hidden="true"><span style={{width: `${Math.max(0, Math.min(100, value / 99 * 100))}%`}} /></div>}
  </div>;
}

// 守備適正ダイヤモンド
const FIELD_POSITIONS = [
  { key:"捕手",   x:150, y:165, label:"C"  },
  { key:"一塁手", x:232, y:100, label:"1B" },
  { key:"二塁手", x:166, y:44,  label:"2B" },
  { key:"三塁手", x:68,  y:100, label:"3B" },
  { key:"遊撃手", x:104, y:60,  label:"SS" },
  { key:"左翼手", x:22,  y:22,  label:"LF" },
  { key:"中堅手", x:150, y:6,   label:"CF" },
  { key:"右翼手", x:278, y:22,  label:"RF" },
];

function profColor(prof){
  if(prof>=80) return "#14714b";
  if(prof>=60) return "#805700";
  if(prof>=40) return "#f97316";
  return "#b42332";
}

function PositionDiamond({player, convertTarget, onSetConvertTarget}){
  const positions = player.positions || {[player.pos]:100};

  const handleClick = (key) => {
    if(!onSetConvertTarget) return;
    onSetConvertTarget(key === convertTarget ? null : key);
  };

  return(
    <div style={{background:"rgba(255,255,255,.03)",borderRadius:8,padding:"10px 12px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:14,color:"#53657c",fontWeight:700,letterSpacing:".05em"}}>守備適正</span>
        {onSetConvertTarget&&<span style={{fontSize:14,color:"#818cf8"}}>ポジションをクリックでコンバート指示</span>}
      </div>

      <svg viewBox="0 0 300 180" style={{width:"100%",display:"block",maxHeight:160}}>
        {/* ファウルライン */}
        <line x1="150" y1="148" x2="5"   y2="5"   stroke="rgba(255,255,255,.05)" strokeWidth="1"/>
        <line x1="150" y1="148" x2="295" y2="5"   stroke="rgba(255,255,255,.05)" strokeWidth="1"/>
        {/* 内野ダイヤモンド */}
        <polygon points="150,148 228,94 150,40 72,94"
          fill="rgba(52,211,153,.04)" stroke="rgba(52,211,153,.18)" strokeWidth="1"/>

        {FIELD_POSITIONS.map(({key, x, y, label})=>{
          const prof    = positions[key];
          const isPrimary   = key === player.pos;
          const isConverting = key === convertTarget;
          const hasProf = prof != null;
          const canClick = onSetConvertTarget && !isPrimary;

          const color = isPrimary ? "#095cc7" : hasProf ? profColor(prof) : "rgba(255,255,255,.2)";
          const r     = isPrimary ? 15 : 12;
          const bgOpacity = isPrimary ? ".18" : hasProf ? ".12" : ".03";

          return(
            <g key={key}
               style={{cursor: canClick ? "pointer" : "default"}}
               onClick={()=> canClick && handleClick(key)}>
              {/* 外枠ハイライト（コンバート中） */}
              {isConverting&&<circle cx={x} cy={y} r={r+4} fill="none" stroke="#818cf8" strokeWidth="1" strokeDasharray="3,2" opacity=".7"/>}
              {/* メイン円 */}
              <circle cx={x} cy={y} r={r}
                fill={`${color.replace("#","rgba(").replace(/^rgba\(/,"rgba(")}`}
                style={{fill: `${color}${bgOpacity.replace(".","").padStart(2,"0")}`}}
                stroke={isConverting ? "#818cf8" : color}
                strokeWidth={isPrimary ? 2 : isConverting ? 1.5 : 1}
              />
              {/* ラベル */}
              <text x={x} y={y-2} textAnchor="middle" fontSize="7.5"
                fill={color} fontWeight={isPrimary?"bold":"normal"}>{label}</text>
              {/* 習熟度 or 主 */}
              <text x={x} y={y+8} textAnchor="middle" fontSize="7.5" fill={color}>
                {isPrimary ? "主" : hasProf ? Math.round(prof) : "?"}
              </text>
              {/* コンバート中矢印 */}
              {isConverting&&<text x={x} y={y-r-3} textAnchor="middle" fontSize="8" fill="#818cf8">▶</text>}
            </g>
          );
        })}
      </svg>

      {/* コンバート状態表示 */}
      {convertTarget && convertTarget !== player.pos && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:4,padding:"4px 8px",background:"rgba(129,140,248,.08)",borderRadius:6,border:"1px solid rgba(129,140,248,.2)"}}>
          <span style={{fontSize:14,color:"#818cf8"}}>
            ▶ {convertTarget}にコンバート中&nbsp;
            ({Math.round(positions[convertTarget]??0)}/100)
          </span>
          {onSetConvertTarget&&(
            <button
              style={{fontSize:14,background:"none",border:"1px solid rgba(129,140,248,.3)",color:"#818cf8",borderRadius:3,padding:"1px 6px",cursor:"pointer"}}
              onClick={()=>onSetConvertTarget(null)}
            >解除</button>
          )}
        </div>
      )}

      {/* 凡例 */}
      <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:6}}>
        {[["#095cc7","主"],["#14714b","80+"],["#805700","60+"],["#f97316","40+"],["#b42332","~39"]].map(([c,l])=>(
          <span key={l} style={{fontSize:7.5,color:c,display:"flex",alignItems:"center",gap:2}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:c,display:"inline-block"}}/>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

const VALID_SECTIONS = new Set(["profile", "stats", "battedBall", "career"]);

function resolveInitialSection(player, requestedSection) {
  if (!VALID_SECTIONS.has(requestedSection)) return "profile";
  if (requestedSection === "battedBall" && player?.isPitcher) return "stats";
  return requestedSection;
}

export function PlayerModal({
  farmState, player: p, teamName, isMyTeam, initialSection = "profile",
  saveId, year, teams, isCompared = false, onToggleCompare, onNavigate,
  onSetConvertTarget, onClose,
}) {
  const [activeSection, setActiveSection] = useState(() => resolveInitialSection(p, initialSection));
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const closeDialog = useCallback(() => closeRef.current?.(), []);
  const dialogRef = useResultDialog(closeDialog, Boolean(p));
  const uniqueId = useId();
  if (!p) return null;
  const s = p.stats || {}, scope = firstTeamScope(year);
  const tabId = section => `${uniqueId}-${section}`;
  const sections = [["profile", "概要"], ["stats", "今季成績"], ...(!p.isPitcher ? [["battedBall", "打球分析"]] : []), ["career", "年度別・通算"]];
  const activateTab = (event, index) => {
    const moves = { ArrowRight: (index + 1) % sections.length, ArrowLeft: (index + sections.length - 1) % sections.length, Home: 0, End: sections.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = moves[event.key]; setActiveSection(sections[next][0]);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  const faProgress = getFaProgress(p);
  const faLabel = p.isFA ? 'FA中' : !faProgress.recorded ? 'FA登録日数未記録'
    : `${faProgress.domestic.eligible ? '国内FA資格あり' : `国内FA 最短あと${faProgress.domestic.years}年（${faProgress.domestic.remainingDays}日）`}${faProgress.estimated ? '・推定' : ''}`;
  const phase = { growth: '成長期', peak: '全盛期', earlyDecline: '衰退初期', decline: '衰退期' }[p.growthPhase] || '成長段階未記録';
  const abilities = p.isPitcher ? [['球速', 'velocity'], ['制球', 'control'], ['スタミナ', 'stamina'], ['変化球', 'breaking'], ['球種', 'variety'], ['ピンチ', 'clutchP']]
    : [['ミート', 'contact'], ['長打', 'power'], ['走力', 'speed'], ['守備', 'defense'], ['選球眼', 'eye'], ['クラッチ', 'clutch']];
  const careerTeamId = teams?.find(t => t.name === teamName)?.id;
  const foreignExemptDays = p.isForeign && !p.isFA && faProgress.recorded ? faProgress.overseas.remainingDays : 0;
  const safeName = String(p.name ?? '名前未記録').slice(0, 60);
  const safeTeam = typeof teamName === 'string' ? teamName.slice(0, 80) : '球団未記録';
  const stat = (label, key) => <StatRow key={label} label={label} value={detailNumber(s[key])} />;
  const rate = (label, key) => <StatRow key={label} label={label} value={detailRate(s, key)} />;
  return <div className="player-modal-overlay calm-player-surface player-detail-ui" data-ds="player-detail" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`player-modal-card ${activeSection === 'battedBall' ? 'wide' : ''}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${uniqueId}-title`}>
      <div className="player-detail-return"><Button variant="secondary" onClick={onClose}>元の画面に戻る</Button><Button variant="secondary" onClick={onClose} aria-label="選手詳細を閉じる">✕</Button></div>
      <header className="player-identity-heading">
        <div><h2 id={`${uniqueId}-title`}>{safeName}</h2><p>{safeTeam} · {playerMembership(p, teams)}</p><p>{Number.isFinite(p.age) ? `${p.age}歳` : '年齢未記録'} / {p.pos || '役割未記録'}{p.isPitcher && p.subtype && p.subtype !== p.pos ? `（${String(p.subtype).slice(0, 30)}）` : ''}{p.isPitcher && p.hand ? ` · ${p.hand === 'left' ? '左投' : '右投'}` : ''}</p></div>
        {onToggleCompare && <Button variant="secondary" aria-pressed={isCompared} className="compare-add-button" onClick={() => onToggleCompare(p, teamName)}>{isCompared ? '比較から外す' : '＋ 比較'}</Button>}
      </header>
      <div className="player-state-summary">
        {(p.injuryDaysLeft ?? 0) > 0 && <strong className="player-injury">負傷中 · {String(p.injury || '').slice(0,40)}{p.injuryPart ? ` [${String(p.injuryPart).slice(0,20)}]` : ''} · 残{p.injuryDaysLeft}試合</strong>}
        <span>コンディション {detailNumber(p.condition)}</span><span>モラル {detailNumber(p.morale)}</span>
        {p.isForeign && <span>外国人</span>}{p.育成 && <span>育成</span>}<span>{phase}</span>
      </div>
      <div className="player-detail-tabs" role="tablist" aria-label="選手詳細">
        {sections.map(([key, label], index) => <button key={key} type="button" id={tabId(key)} role="tab" aria-selected={activeSection === key} aria-controls={`${tabId(key)}-panel`} tabIndex={activeSection === key ? 0 : -1} className={activeSection === key ? 'on' : ''} onClick={() => setActiveSection(key)} onKeyDown={e => activateTab(e, index)}>{label}</button>)}
      </div>
      <div role="tabpanel" id={`${tabId(activeSection)}-panel`} aria-labelledby={tabId(activeSection)} tabIndex={0} className="player-detail-panel">
        {activeSection === 'profile' && <>
          <div className="player-profile-grid">
            <Section title="能力・状態"><div className="player-ability-list">{abilities.map(([label, key]) => <AbilityBar key={key} label={label} value={(p.isPitcher ? p.pitching : p.batting)?.[key]} />)}</div><StatRow label="潜在能力" value={detailNumber(p.potential)} /><p className="player-record-note">能力はゲーム内評価値です。投手の球速能力はkm/hではありません。</p></Section>
            <Section title="契約"><StatRow label="年俸" value={detailSalary(p.salary)} /><StatRow label="残年数" value={Number.isFinite(p.contractYearsLeft) ? `${p.contractYearsLeft}年` : '— 未記録'} /><StatRow label="在籍" value={Number.isFinite(p.serviceYears) ? `${p.serviceYears}年` : '— 未記録'} /><p className="player-record-note">{faLabel}</p>{foreignExemptDays > 0 && <p className="player-record-note">外国人枠免除まで {foreignExemptDays}日</p>}</Section>
          </div>
        </>}
        {activeSection === 'stats' && <>
          <Section title={`${scope} 成績`}><p className="player-record-note">現在の所属にかかわらず一軍の今季記録です。二軍成績は合算しません。</p>
            <div className="player-stat-grid">
              {p.isPitcher ? <><div>{rate('防御率','ERA')}<StatRow label="投球回" value={detailInnings(s.IP)} />{stat('奪三振','Kp')}{rate('WHIP','WHIP')}{stat('勝利','W')}{stat('敗戦','L')}{stat('セーブ','SV')}{stat('ホールド','HLD')}</div><div><h3>一軍打撃成績</h3>{stat('打席','PA')}{stat('打数','AB')}{rate('打率','AVG')}{stat('安打','H')}{stat('打点','RBI')}{stat('犠打','SH')}{rate('OPS','OPS')}</div></>
                : <div>{rate('打率','AVG')}{stat('本塁打','HR')}{stat('打点','RBI')}{rate('OPS','OPS')}{stat('打席','PA')}{stat('打数','AB')}{stat('盗塁','SB')}{rate('出塁率','OBP')}{rate('強打球率','hardHitPct')}</div>}
            </div><p className="player-record-note">— 未記録：必要な値なし。— 算出不可：分母0。0は記録済みの値です。</p>
          </Section>
          <Section title="二軍成績"><p className="player-record-note">二軍実測・年度別記録。年度と記録開始時点は以下の表示を確認してください。</p><FarmPlayerHistory state={farmState} player={p} /></Section>
        </>}
        {activeSection === 'battedBall' && !p.isPitcher && <Section title="一軍・打球分析"><p className="player-record-note">{scope}。期間・対象打球の条件は下の表示を確認してください。</p><div className="calm-detail detail-analysis"><BattedBallAnalysisPanel player={p} saveId={saveId} year={year} teams={teams} teamName={teamName} /></div></Section>}
        {activeSection === 'career' && <Section title="一軍・年度別／通算"><p className="player-record-note">保存された一軍年度別成績と、{Number.isInteger(year) ? `${year}年` : '今季'}の記録。二軍実測・旧推定は合算しません。</p><div className="calm-detail detail-analysis"><CareerTable player={p} year={year} teamId={careerTeamId} teamName={teamName} saveId={saveId} /></div></Section>}
      </div>
      {onNavigate && <div className="player-decision-actions" aria-label="この選手について判断する"><span>この選手について判断</span>{isMyTeam && <Button variant="secondary" onClick={() => onNavigate('roster',p,teamName)}>起用へ</Button>}{isMyTeam && <Button variant="secondary" onClick={() => onNavigate('contract',p,teamName)}>契約へ</Button>}<Button variant="secondary" onClick={() => onNavigate('trade',p,teamName)}>トレードへ</Button></div>}
    </div>
  </div>;
}

function StatRow({label,value}) {
  return <div className="player-stat-row"><span>{label}</span><strong>{value}</strong></div>;
}
