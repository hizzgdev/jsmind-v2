import { computed, defineComponent, h, type Component } from 'vue';
import { useData } from 'vitepress';

import { DOCS_URL, TUTORIALS_URL } from '../../../site.config.mjs';

/**
 * The header's section links: the two published columns beside the product
 * name, so every face of the site can reach the others and the product page.
 *
 * This file is a copy of `tutorials/.vitepress/theme/section-links.ts`, the
 * same way the stylesheet and the AI notice are copies. The two sites are
 * separate VitePress roots, so a shared module above both roots would be a
 * third thing to keep in step with VitePress's own slots on an upgrade; a
 * copy per root plus a test that both render keeps the coupling where the
 * repository already accepts it.
 *
 * Which face is current comes from the component that mounts it, not from the
 * URL: the docs site is Docs on every docs page, and the tutorials site is
 * Tutorials on every tutorial page.
 */

/** Which published face is rendering the header. */
export type SectionKey = 'docs' | 'tutorials';

/** Wrapper class, for the stylesheet that places the links. */
export const SECTION_LINKS_CLASS = 'jsmind-section-links';

/** Class on the link of the section the reader is in. */
export const SECTION_LINKS_CURRENT_CLASS = 'is-current';

interface Section {
    key: SectionKey;
    label: string;
    url: string;
}

/**
 * The two columns, in header order.
 *
 * The labels stay English on both locales: they name the product's columns,
 * not the page's language, and a Chinese reader who switched the page still
 * recognises the same two words in the header. The address each one carries is
 * the locale the reader is in, so a Chinese page offers the Chinese column.
 */
export const SECTIONS: Section[] = [
    { key: 'docs', label: 'Docs', url: DOCS_URL },
    { key: 'tutorials', label: 'Tutorials', url: TUTORIALS_URL },
];

/**
 * Section links for one face of the site.
 *
 * Mounted twice per face: beside the title in the nav bar
 * (`nav-bar-content-before`, the left end of the nav's content area) and at
 * the top of the mobile menu (`nav-screen-content-before`). VitePress hides
 * the bar's menu below 768px and opens the screen menu instead, so a column
 * that only existed in the bar would be unreachable on a phone.
 *
 * The slot is not `nav-bar-title-after`: that one sits inside the title's
 * `<a>`, and links nested in a link are invalid HTML — middle-click and the
 * context menu stop working on them.
 *
 * The current section carries `aria-current="page"`, not just a colour: the
 * colour difference is weak in dark mode, and the attribute is what a screen
 * reader announces and what a test can assert.
 *
 * @param current - The face this header is rendered on.
 */
export function createSectionLinks(current: SectionKey): Component {
    return defineComponent({
        name: 'JsMindSectionLinks',
        setup() {
            const { localeIndex } = useData();
            const locale = computed(() => (localeIndex.value === 'zh' ? 'zh' : 'en'));
            const label = computed(() => (locale.value === 'zh' ? '栏目' : 'Sections'));

            return () =>
                h(
                    'nav',
                    { 'class': SECTION_LINKS_CLASS, 'aria-label': label.value },
                    SECTIONS.map((section) =>
                        h(
                            'a',
                            {
                                'key': section.key,
                                'href': `${section.url}${locale.value}/`,
                                // The structural mark of a column link: the
                                // product page's header carries it too, so one
                                // test reads the same thing on all three faces.
                                'data-section': section.key,
                                ...(section.key === current
                                    ? { 'aria-current': 'page', 'class': SECTION_LINKS_CURRENT_CLASS }
                                    : {}),
                            },
                            section.label
                        )
                    )
                );
        },
    });
}
