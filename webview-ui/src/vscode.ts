/**
 * Singleton wrapper for acquireVsCodeApi().
 * This function can only be called ONCE per webview lifetime.
 */
declare function acquireVsCodeApi(): {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vsCodeApi = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

export const vscode = {
  postMessage: (msg: unknown): void => {
    vsCodeApi?.postMessage(msg);
  },
  getState: (): unknown => vsCodeApi?.getState(),
  setState: (state: unknown): void => { vsCodeApi?.setState(state); },
};
