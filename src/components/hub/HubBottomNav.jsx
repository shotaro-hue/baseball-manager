export default function HubBottomNav({ sections, currentPrimarySection, tabBadges, onSectionChange, onStartGame, disableStart }) {
  return (
    <div className="primary-bottom-nav">
      {sections.map((section) => {
        const badgeTab = section.id === 'inbox' ? 'mailbox' : section.id === 'rosterOps' ? 'contract' : null;
        const badge = badgeTab ? tabBadges[badgeTab] : null;
        return (
          <button key={section.id} className={`primary-nav-btn ${currentPrimarySection === section.id ? 'on' : ''}`} onClick={() => onSectionChange(section.id)}>
            <span className="primary-nav-icon">{section.icon}</span>
            <span>{section.label}</span>
            {badge && <span className="primary-nav-badge" style={{ background: badge.color }}>{badge.n}</span>}
          </button>
        );
      })}
      <button className="primary-nav-cta" onClick={onStartGame} disabled={disableStart}>
        次へ進む
      </button>
    </div>
  );
}
