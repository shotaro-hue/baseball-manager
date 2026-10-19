import { sectionBadge } from './hubNavigation';
export default function HubBottomNav({ sections, currentPrimarySection, tabBadges, notifications, onSectionChange }) {
  return (
    <nav className="primary-bottom-nav" aria-label="メインメニュー">
      {sections.map((section) => {
        const badge = sectionBadge(section.id, tabBadges, notifications);
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
