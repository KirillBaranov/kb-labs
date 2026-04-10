/** Abstraction over input sources (stdin, file, http, etc.). */
export interface InputSource {
  read(): Promise<string>;
}
