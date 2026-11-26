import { createContentLoader } from 'vitepress';

import { toTutorialList, type TutorialListItem } from '../.vitepress/tutorial-list';

export default createContentLoader('en/posts/*.md', {
    transform(raw): TutorialListItem[] {
        return toTutorialList(raw);
    },
});

export { type TutorialListItem };
