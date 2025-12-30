import { JsMindError } from './error.ts';
import type { JmSize } from './index.ts';

const untilNextFrame = () => {
    return new Promise(resolve => {
        requestAnimationFrame(resolve);
    });
};

export const ensureElementVisible = async (element: HTMLElement): Promise<void> => {
    return new Promise<void>((resolve) => {
        new IntersectionObserver((entities, observer) => {
            if (entities[0]?.isIntersecting) {
                observer.unobserve(element);
                resolve();
            }
        }).observe(element);
    });
};

export class JmDomUtility {
    static createElement(tagName: string, className: string, jmAttrs: Record<string, string> = {}): JmElement {
        const element = document.createElement(tagName);
        const jmElement = new JmElement(element);
        jmElement.classList.add(className);
        for (const [key, value] of Object.entries(jmAttrs)) {
            jmElement.setAttribute(key, value);
        }
        return jmElement;
    }

    static async measureElement(element: JmElement, container: JmElement): Promise<DOMRect> {
        return await DomUtility.measureElement(element.element, container.element);
    }
}

export class DomUtility {
    static createElement(tagName: string, className: string): HTMLElement {
        const element = document.createElement(tagName);
        element.classList.add(className);
        return element;
    }

    static async measureElement(element: HTMLElement, container: HTMLElement): Promise<DOMRect> {
        const originalDisplay = element.style.display;
        const originalVisibility = element.style.visibility;

        element.style.visibility = 'hidden';
        if (originalDisplay === 'none') {
            element.style.display = 'unset';
        }
        container.appendChild(element);
        await untilNextFrame();
        const rect = element.getBoundingClientRect();
        container.removeChild(element);
        element.style.display = originalDisplay;
        element.style.visibility = originalVisibility;
        return rect;
    }
}

export class JmElement {
    private readonly ATTR_PREFIX = 'data-jm-';

    private readonly _element: HTMLElement;

    private _cachedRect: DOMRect | null = null;

    constructor(element: HTMLElement) {
        if (!element) {
            throw new Error('Element is required');
        }
        this._element = element;
    }

    get element(): HTMLElement {
        return this._element;
    }

    get classList(): DOMTokenList {
        return this._element.classList;
    }

    get innerHTML(): string {
        return this._element.innerHTML;
    }

    set innerHTML(value: string) {
        this._element.innerHTML = value;
    }

    get size(): JmSize {
        if (!this._cachedRect) {
            throw new JsMindError('Rect is not measured yet', { element: this._element });
        }
        return this._cachedRect;
    }

    get style(): CSSStyleDeclaration {
        return this._element.style;
    }

    setAttribute(key: string, value: string): void {
        this._element.setAttribute(this.ATTR_PREFIX + key, value);
    }

    getAttribute(key: string): string | null {
        return this._element.getAttribute(this.ATTR_PREFIX + key);
    }

    removeAttribute(key: string): void {
        this._element.removeAttribute(this.ATTR_PREFIX + key);
    }

    appendChild(child: JmElement | HTMLElement | SVGSVGElement): void {
        if (child instanceof JmElement) {
            this._element.appendChild(child.element);
        } else {
            this._element.appendChild(child);
        }
    }

    cacheRect(rect: DOMRect): void {
        this._cachedRect = rect;
    }
}
