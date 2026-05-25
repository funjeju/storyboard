export type EmotionKey = "Establishing" | "Build" | "Climax" | "Release" | "Brand";

export interface EmotionStyle {
  color: string;
  label: string;
  bg: string;
}

export interface Cut {
  cutNumber: number;
  timeStart: number;
  timeEnd: number;
  duration: number;
  firstFrame?: string;
  composition?: string;
  cameraAction?: string;
  content?: string;
  emotion?: EmotionKey;
}

export interface Beat {
  beatId: string;
  timeStart: number;
  timeEnd: number;
  firstFrame: string;
  cameraAction: string;
  content: string;
  emotion: string;
  audioNote: string;
}

export interface StoryboardMeta {
  topic: string;
  solution: string;
  style: string;
  mood: string;
  effDur: number;
  maxCut: number;
}

export interface Storyboard {
  toneAndMood: string;
  copyLines: string[];
  cuts: Cut[];
  meta: StoryboardMeta;
}
