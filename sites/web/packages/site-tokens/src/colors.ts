export type ColorToken = {
  hex: string;
  rgb: string;
};

export type ColorScale = {
  bg: ColorToken;
  surface: ColorToken;
  text: ColorToken;
  muted: ColorToken;
  line: ColorToken;
  lineStrong: ColorToken;
  accent: ColorToken;
};

export const lightColors: ColorScale = {
  bg:         { hex: '#f7f7f8', rgb: '247 247 248' },
  surface:    { hex: '#ffffff', rgb: '255 255 255' },
  text:       { hex: '#0f1115', rgb: '15 17 21' },
  muted:      { hex: '#5c616d', rgb: '92 97 109' },
  line:       { hex: '#d9dde6', rgb: '217 221 230' },
  lineStrong: { hex: '#c4cad8', rgb: '196 202 216' },
  accent:     { hex: '#0c66ff', rgb: '12 102 255' },
};

export const darkColors: ColorScale = {
  bg:         { hex: '#0d0e11', rgb: '13 14 17' },
  surface:    { hex: '#14161c', rgb: '20 22 28' },
  text:       { hex: '#edeff4', rgb: '237 239 244' },
  muted:      { hex: '#949eb0', rgb: '148 158 176' },
  line:       { hex: '#26293a', rgb: '38 41 58' },
  lineStrong: { hex: '#373c4e', rgb: '55 60 78' },
  accent:     { hex: '#3b82f6', rgb: '59 130 246' },
};
