// CSS variables for the crew mobile screens; night mode swaps to the dark set.
const LIGHT = {
  '--bg': '#f3f1ec', '--sf': '#fbfaf7', '--sf2': '#e9e6df', '--bd': '#dcd8cf', '--bd2': '#bcb6a9',
  '--tx': '#15171a', '--tx2': '#45484d', '--tx3': '#6c6e73', '--ac': '#2447c9', '--ac-s': '#e3e8f8',
  '--g': '#5b8f72', '--g-t': '#2f6448', '--g-s': '#e4ede6', '--y': '#c8962c', '--y-t': '#8a6312', '--y-s': '#f4ead2',
  '--o': '#cf5a2a', '--o-t': '#a63f14', '--o-s': '#f6e1d6', '--r': '#a8231f', '--r-t': '#951c19', '--r-s': '#f3dad8',
};
const DARK = {
  '--bg': '#141518', '--sf': '#1c1e22', '--sf2': '#24262b', '--bd': '#2e3036', '--bd2': '#45484f',
  '--tx': '#ecebe6', '--tx2': '#b6b7b5', '--tx3': '#8f9297', '--ac': '#7d98f2', '--ac-s': '#1e2640',
  '--g': '#6fa585', '--g-t': '#8fc4a5', '--g-s': '#1d2c24', '--y': '#d6a640', '--y-t': '#e0b45a', '--y-s': '#33291a',
  '--o': '#e0703f', '--o-t': '#ee8a5e', '--o-s': '#3a2219', '--r': '#c8332d', '--r-t': '#f08a84', '--r-s': '#3a1d1c',
};
export const mobileVars = (night) => (night ? DARK : LIGHT);
