import { lightColors, darkColors, type ColorScale } from './colors';

export type Theme = {
  colors: ColorScale;
};

export const lightTheme: Theme = {
  colors: lightColors,
};

export const darkTheme: Theme = {
  colors: darkColors,
};
