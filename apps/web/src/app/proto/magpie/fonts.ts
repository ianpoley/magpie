// Throwaway: each direction's faces, loaded only on /proto/magpie and applied to <html> by the harness.
import { Bricolage_Grotesque, Instrument_Sans, Instrument_Serif, Pixelify_Sans, Rubik } from "next/font/google";

const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--f-instrument" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--f-instrument-serif" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--f-brico", axes: ["wdth", "opsz"] });
const rubik = Rubik({ subsets: ["latin"], variable: "--f-rubik" });
const pixelify = Pixelify_Sans({ subsets: ["latin"], variable: "--f-pixelify" });

export const fontVars = [instrument, instrumentSerif, bricolage, rubik, pixelify].map((f) => f.variable).join(" ");
