import type { Presenter } from "./types";
import { sideBorderBox, safeColors, safeSymbols } from "@kb-labs/shared-cli-ui";

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
    error: (line) => {
      const box = sideBorderBox({
        title: 'Error',
        sections: [{ items: [String(line)] }],
        status: 'error',
      });
      console.error(box);
    },
    json: (_payload) => {
      throw new Error("json() called in text mode");
    },
  };
}

export type TextPresenter = ReturnType<typeof createTextPresenter>;
