import type { JmSize } from './index.ts';

export class DomUtility {
    static createElement(tagName: string, className: string, jmAttrs: Record<string, string> = {}): JmElement {
        const element = document.createElement(tagName);
        const jmElement = new JmElement(element);
        jmElement.classList.add(className);
        for (const [key, value] of Object.entries(jmAttrs)) {
            jmElement.setAttribute(key, value);
        }
        return jmElement;
    }
}

export class JmElement {
    private readonly ATTR_PREFIX = 'data-jm-';

    private readonly _element: HTMLElement;

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

    getBoundingClientRect(): DOMRect {
        return this._element.getBoundingClientRect();
    }

    getSize(): JmSize {
        const rect = this._element.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height,
        };
    }
}
