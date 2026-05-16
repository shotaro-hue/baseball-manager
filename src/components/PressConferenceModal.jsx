import { useState } from 'react';

/**
 * 月次記者会見モーダル
 * @param {{ event: import('../engine/pressConference').PressQuestion, onAnswer: (choiceIdx: number) => void }} props
 */
export function PressConferenceModal({ event, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);

  if (!event) return null;

  const handleAnswer = () => {
    if (selected === null) return;
    setAnswered(true);
    setTimeout(() => onAnswer(selected), 900);
  };

  const choice = selected !== null ? event.choices[selected] : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 16,
    }}>
      <div style={{
        background: 'linear-gradient(135deg,#0d1f2d,#112233)',
        border: '1px solid rgba(148,163,184,.25)',
        borderRadius: 12, padding: 24, maxWidth: 480, width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,.6)',
      }}>
        <div style={{ fontSize: 10, color: '#60a5fa', letterSpacing: '.18em', marginBottom: 10 }}>
          📰 記者会見
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18, lineHeight: 1.5 }}>
          {event.question}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {event.choices.map((c, i) => (
            <button
              key={i}
              onClick={() => !answered && setSelected(i)}
              style={{
                background: selected === i
                  ? 'rgba(96,165,250,.18)'
                  : 'rgba(255,255,255,.04)',
                border: selected === i
                  ? '1px solid rgba(96,165,250,.6)'
                  : '1px solid rgba(148,163,184,.15)',
                borderRadius: 8, padding: '10px 14px',
                textAlign: 'left', cursor: answered ? 'default' : 'pointer',
                transition: 'all .15s', color: '#e2e8f0', fontSize: 12,
              }}
            >
              <span style={{ fontSize: 9, color: '#60a5fa', marginRight: 8 }}>{c.label}</span>
              {c.text}
            </button>
          ))}
        </div>

        {answered && choice && (
          <div style={{
            background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.3)',
            borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 16,
          }}>
            <span style={{ color: '#4ade80', fontWeight: 700, marginRight: 8 }}>効果:</span>
            人気{choice.popMod >= 0 ? '+' : ''}{choice.popMod}
            <span style={{ margin: '0 8px', color: '#475569' }}>|</span>
            チームモラル{choice.moraleMod >= 0 ? '+' : ''}{choice.moraleMod}
          </div>
        )}

        <button
          onClick={handleAnswer}
          disabled={selected === null || answered}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: selected !== null && !answered
              ? 'linear-gradient(135deg,#1e40af,#2563eb)'
              : 'rgba(255,255,255,.06)',
            border: '1px solid rgba(96,165,250,.4)',
            color: selected !== null && !answered ? '#fff' : '#475569',
            cursor: selected !== null && !answered ? 'pointer' : 'default',
            transition: 'all .15s',
          }}
        >
          {answered ? '回答済み…' : '回答する'}
        </button>
      </div>
    </div>
  );
}
