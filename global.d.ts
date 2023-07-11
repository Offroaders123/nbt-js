declare global {
  interface ArrayBuffer {
    toString(): "[object ArrayBuffer]";
  }

  interface Window {
    zlib: typeof import("node:zlib");
  }
}

export {};