import journal from './playerMaster2026.reviewed.json' with {type:'json'};
import {indexReviewedFacts} from './reviewedPlayerFacts.js';

// Independently checked factual values, not article text or source tables.
// A cited source is not thereby licensed for bulk republication.
export const REVIEWED_FACTS_2026=indexReviewedFacts(journal);
