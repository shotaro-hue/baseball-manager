import React from 'react';
import { HomeSummary, HomeFixture, HomeAlerts, HomeResults } from './homeSections';

export function MobileHome(props) {
  if (!props.myTeam) return null;
  return <main className="mobile-home flow-screen home-surface" data-ds="home">
    <HomeSummary {...props}/><HomeFixture {...props}/><HomeAlerts {...props}/><HomeResults {...props}/>
  </main>;
}
