import { parentTab, secondaryTabs } from './hubNavigation';
export default function HubTabsNav({ activeSection, tab, tabBadges = {}, onTabChange }) {
  const nested = secondaryTabs(tab);
  return (
    <div className="tabs-nav redesigned-tabs">
      <div className="tab-group">
        <div className="tab-group-label">{activeSection.label}</div>
        <nav className="tabs" aria-label={`${activeSection.label}メニュー`}>
          {activeSection.tabs.map(([id, label]) => (
            <button key={id} aria-current={parentTab(tab) === id ? 'page' : undefined} className={`tab ${parentTab(tab) === id ? 'on' : ''}`} onClick={() => onTabChange(id)}>
              {label}
              {tabBadges[id] && (
                <span style={{ marginLeft: 4, background: tabBadges[id].color, color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
                  {tabBadges[id].n}
                </span>
              )}
            </button>
          ))}
        </nav>
        {nested.length > 0 && <nav className="hub-secondary-nav" aria-label={parentTab(tab) === 'reinforcement' ? '補強メニュー' : '記録・球団史メニュー'}>
          {nested.map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => onTabChange(id)}>{label}
            {tabBadges[id]?.n > 0 && <span className="hub-count">{tabBadges[id].label || (id === 'trade' ? '要対応' : '候補')} {tabBadges[id].n}</span>}
          </button>)}
        </nav>}
      </div>
    </div>
  );
}
