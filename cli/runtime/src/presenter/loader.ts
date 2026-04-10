import * as readline from "readline";

export interface LoaderOptions {
  enabled: boolean;
}

export interface LoaderTick {
  current?: number;
  total?: number;
  step?: string;
}

export interface Loader {
  start(label: string): void;
  tick(info?: LoaderTick): void;
  stop(success?: boolean, finalMessage?: string): void;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL = 80;

export function createLoader(options: LoaderOptions): Loader {
  const { enabled } = options;

  let intervalId: NodeJS.Timeout | null = null;
  let currentFrame = 0;
  let currentLabel = "";
  let currentInfo: LoaderTick = {};
  let isRunning = false;

  function updateDisplay() {
    if (!enabled || !process.stdout.isTTY || !isRunning) {
      return;
    }

    const frame = SPINNER_FRAMES[currentFrame];
    currentFrame = (currentFrame + 1) % SPINNER_FRAMES.length;

    let displayText = `${frame} ${currentLabel}`;

    if (currentInfo.step) {
      displayText += ` - ${currentInfo.step}`;
    }

    if (currentInfo.current !== undefined && currentInfo.total !== undefined) {
      displayText += ` [${currentInfo.current}/${currentInfo.total}]`;
    }

    // Clear current line and write new content
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(displayText);
  }

  function start(label: string) {
    if (!enabled || !process.stdout.isTTY) {
      return;
    }

    currentLabel = label;
    currentInfo = {};
    isRunning = true;

    // Hide cursor
    process.stdout.write("\x1B[?25l");

    // Start spinner
    intervalId = setInterval(updateDisplay, SPINNER_INTERVAL);
    updateDisplay();
  }

  function tick(info?: LoaderTick) {
    if (!enabled || !process.stdout.isTTY || !isRunning) {
      return;
    }

    if (info) {
      currentInfo = { ...currentInfo, ...info };
    }
    updateDisplay();
  }

  function stop(success?: boolean, finalMessage?: string) {
    if (!enabled || !process.stdout.isTTY || !isRunning) {
      return;
    }

    isRunning = false;

    // Clear interval
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    // Clear line and show final message
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    if (finalMessage) {
      const icon = success === false ? "✗" : success === true ? "✓" : "";
      process.stdout.write(`${icon} ${finalMessage}`);
    }

    // Restore cursor and move to next line
    process.stdout.write("\x1B[?25h");
    process.stdout.write("\n");
  }

  return {
    start,
    tick,
    stop,
  };
}
