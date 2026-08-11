// Setup file to expose DOM API globally for happy-dom tests
import { Window } from 'happy-dom';

// Create a happy-dom window instance
const happyDomWindow = new Window();

// Make window and document available globally
(globalThis as any).window = happyDomWindow;
(globalThis as any).document = happyDomWindow.document;
(globalThis as any).Element = happyDomWindow.Element;
(globalThis as any).HTMLElement = happyDomWindow.HTMLElement;
(globalThis as any).SVGElement = happyDomWindow.SVGElement;
