import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";

const { fontFamily: jakartaFamily } = loadJakarta("normal", {
  weights: ["500", "600", "700", "800"],
});

const { fontFamily: serifFamily } = loadSerif("italic", {
  weights: ["400"],
});

export const JAKARTA = jakartaFamily;
export const SERIF = serifFamily;
