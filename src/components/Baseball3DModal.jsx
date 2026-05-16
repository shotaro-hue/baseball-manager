import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { calcLandingZone, resolveFieldSideBySprayAngle } from '../engine/physics';

const ReplayCanvas3D = lazy(() => import('./game/ReplayCanvas3D'));

function sanitizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function validate3DReplayEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { ok: false, reason: 'event が不正です', normalized: null };
  }

  const ev = Number(event.ev);
  const la = Number(event.la);
  if (!Number.isFinite(ev) || !Number.isFinite(la)) {
    return { ok: false, reason: 'event.ev または event.la が不正です', normalized: null };
  }

  return {
    ok: true,
    reason: '',
    normalized: {
      ...event,
      ev,
      la,
      type: event.type || event.result || 'batted_ball',
    },
  };
}

function convertToPitcherViewLabel(fieldLabel) {
  if (typeof fieldLabel !== 'string') return '中堅';
  if (fieldLabel === '左翼') return '右翼';
  if (fieldLabel === '右翼') return '左翼';
  return fieldLabel;
}

function convertToPitcherViewZone(zoneLabel) {
  if (typeof zoneLabel !== 'string') return '中間';
  return zoneLabel
    .replaceAll('左翼', '__TMP_SIDE__')
    .replaceAll('右翼', '左翼')
    .replaceAll('__TMP_SIDE__', '右翼');
}

function ReplayFallback() {
  return (
    <div
      className="sim-warning"
      style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      3Dリプレイを読み込み中...
    </div>
  );
}

export default function Baseball3DModal({ event, stadium, onClose }) {
  const closeButtonRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');
  const validation = useMemo(() => validate3DReplayEvent(event), [event]);

  const safeData = useMemo(() => {
    try {
      if (!validation.ok) return null;

      const normalizedEvent = validation.normalized;
      const safeEv = sanitizeNumber(normalizedEvent.ev);
      const safeLa = sanitizeNumber(normalizedEvent.la);
      const safeSpray = sanitizeNumber(normalizedEvent.sprayAngle, 45);
      const safeDist = sanitizeNumber(normalizedEvent.dist);
      const safeZone = calcLandingZone(safeDist, safeSpray, stadium ?? {});
      const safeFieldSide = resolveFieldSideBySprayAngle(safeSpray);
      const displayFieldSideLabel = convertToPitcherViewLabel(
        safeFieldSide?.label,
      );
      const displayZoneLabel = convertToPitcherViewZone(safeZone);

      return {
        safeEv,
        safeLa,
        safeSpray,
        safeDist,
        displayFieldSideLabel,
        displayZoneLabel,
      };
    } catch (_) {
      return null;
    }
  }, [event, stadium, validation]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!validation.ok) {
      setErrorMessage(`リプレイデータが不正です: ${validation.reason}`);
      onClose?.();
      return;
    }
    if (!safeData) {
      setErrorMessage('リプレイデータの解析に失敗しました');
      return;
    }
    setErrorMessage('');
  }, [validation, safeData, onClose]);

  if (typeof onClose !== 'function') return null;

  return (
    <div className="sim-modal-overlay" onClick={onClose} role="presentation">
      <section
        className="sim-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="3Dリプレイ"
      >
        <header className="sim-modal-header">
          <div>
            <h2 className="sim-modal-title">3D リプレイ</h2>
            <p className="sim-modal-subtitle">
              打球データから 3D の軌道を再生します。
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="sim-modal-close-btn"
            onClick={onClose}
            aria-label="モーダルを閉じる"
          >
            ×
          </button>
        </header>

        <div className="sim-modal-body">
          {errorMessage ? (
            <div className="sim-warning">エラー: {errorMessage}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div className="sim-chip">
                  打球速度: <strong>{safeData?.safeEv ?? 0}</strong> km/h
                </div>
                <div className="sim-chip">
                  打球角度: <strong>{safeData?.safeLa ?? 0}</strong>°
                </div>
                <div className="sim-chip">
                  方向角: <strong>{safeData?.safeSpray ?? 45}</strong>°
                </div>
                <div className="sim-chip">
                  打球方向: <strong>{safeData?.displayFieldSideLabel ?? '中堅'}</strong>
                </div>
                <div className="sim-chip">
                  推定飛距離: <strong>{safeData?.safeDist ?? 0}</strong> m
                </div>
                <div className="sim-chip">
                  落下地点: <strong>{safeData?.displayZoneLabel ?? '中間'}</strong>
                </div>
              </div>

              {safeData ? (
                <Suspense fallback={<ReplayFallback />}>
                  <ReplayCanvas3D
                    ev={safeData.safeEv}
                    la={safeData.safeLa}
                    sprayAngle={safeData.safeSpray}
                    stadium={stadium}
                  />
                </Suspense>
              ) : (
                <div className="sim-warning">
                  リプレイデータの解析に失敗しました
                </div>
              )}
            </>
          )}
        </div>

        <footer className="sim-modal-footer">
          <button
            type="button"
            className="sim-modal-close-btn"
            onClick={onClose}
          >
            閉じる
          </button>
        </footer>
      </section>
    </div>
  );
}
