export default function HubTabsNav({ activeSection, tab, tabBadges, onTabChange }) {
  return (
    <div className="tabs-nav redesigned-tabs">
      <div className="tab-group">
        <div className="tab-group-label">{activeSection.label}</div>
        <div className="tabs">
          {activeSection.tabs.map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => onTabChange(id)}>
              {label}
              {tabBadges[id] && (
                <span style={{ marginLeft: 4, background: tabBadges[id].color, color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
                  {tabBadges[id].n}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
