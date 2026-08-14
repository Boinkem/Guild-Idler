/**
 * Static reference content for the Guide tab's "How To" section -- not
 * generated from events, unlike the notification log. Same "grows over
 * time, not complete on day one" expectation as GuidanceManager's topics.
 *
 * Lives in json/guide-topics.json (devtool-editable, new `guide-topics`
 * content type) rather than a hardcoded array -- a new topic, or a wording
 * fix on an existing one, no longer needs a code patch. `body` renders as
 * a textarea in the devtool (same convention description/flavour/blurb
 * fields already get), since these run a sentence or two each.
 */
export interface GuideTopic {
  id: string;
  title: string;
  body: string;
}

import guideTopicsJson from './json/guide-topics.json';
export const GUIDE_TOPICS: GuideTopic[] = guideTopicsJson as GuideTopic[];
