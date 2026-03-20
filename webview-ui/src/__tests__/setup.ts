import '@testing-library/jest-dom';

// Mock the vscode API used in webview
const mockVscode = {
  postMessage: vi.fn(),
  getState: vi.fn(() => undefined),
  setState: vi.fn(),
};

// acquireVsCodeApi is injected by VS Code into the webview's window
(window as any).acquireVsCodeApi = vi.fn(() => mockVscode);
(window as any).__vscode__ = mockVscode;

// jsdom doesn't implement scrollIntoView — polyfill it
window.HTMLElement.prototype.scrollIntoView = vi.fn();
