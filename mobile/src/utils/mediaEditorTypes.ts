/** Fotograf (SendMediaSheet) ve video (SendVideoSheet) editorlerinin AYNI
 * sekilde paylastigi cizim/metin-etiketi veri sekilleri. */
export interface StrokePath {
  d: string;
  color: string;
}
export interface TextSticker {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  font?: string;
}
