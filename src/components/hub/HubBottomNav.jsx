export default function HubBottomNav({ sections, currentPrimarySection, tabBadges, onSectionChange, onStartGame, disableStart }) {
  return (
    <nav className="primary-bottom-nav" aria-label="メインメニュー">
      {sections.map((section) => {
        const badgeTab = section.id === 'other' ? 'mailbox' : null;
        const badge = badgeTab ? tabBadges[badgeTab] : null;
        return (
          <button key={section.id} aria-current={currentPrimarySection === section.id ? 'page' : undefined} className={`primary-nav-btn ${currentPrimarySection === section.id ? 'on' : ''}`} onClick={() => onSectionChange(section.id)}>
            <span className="primary-nav-icon">{section.icon}</span>
            <span>{section.label}</span>
            {badge && <span className="primary-nav-badge" style={{ background: badge.color }}>{badge.n}</span>}
          </button>
        );
      })}
    </nav>
  );
}
