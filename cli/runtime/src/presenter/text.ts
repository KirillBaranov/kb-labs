import type { Presenter } from "./types";

export function createTextPresenter(isQuiet: boolean = false): Presenter {
  const isTTY = process.stdout.isTTY === true;
  return {
    isTTY,
    isQuiet,
    isJSON: false,
    write: (line) => {
      if (!isQuiet) {
        console.log(line);
      }
    },
    info: (line) => {
      if (!isQuiet) {
        console.log(line);
      }
    },
    warn: (line) => {
      if (!isQuiet) {
        console.warn(line);
      }
    },
    error: (line) => console.error(line),
    json: (_payload) => {
      throw new Error("json() called in text mode");
    },
  };
}

export type TextPresenter = ReturnType<typeof createTextPresenter>;
