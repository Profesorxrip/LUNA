import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-cpu";
import * as nsfwjs from "nsfwjs";
import { Jimp } from "jimp";

// Sohbette paylasilan fotograflarin "+18 icerik" isaretini artik kullanici
// MANUEL koymuyor - nsfwjs (MobileNetV2) ile OTOMATIK tespit ediliyor.
// Model agirliklari pakete GOMULU (base64) - calisma aninda INTERNETE
// IHTIYAC YOK, baska hicbir servise resim gonderilmiyor.
let modelPromise: Promise<nsfwjs.NSFWJS> | null = null;
function getModel(): Promise<nsfwjs.NSFWJS> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.setBackend("cpu");
      await tf.ready();
      return nsfwjs.load();
    })();
  }
  return modelPromise;
}

// nsfwjs 5 sinif dondurur: Drawing, Hentai, Neutral, Porn, Sexy - sadece
// acik sekilde pornografik/hentai iceriği +18 sayiyoruz, "Sexy" (orn. mayo/
// ic camasiri) cok fazla YANLIS POZITIF uretiyor, bu yuzden dahil etmiyoruz.
const ADULT_CLASSES = new Set(["Porn", "Hentai"]);
const ADULT_THRESHOLD = 0.7;

// Sunucu baslarken modeli ONCEDEN yukler - ilk fotografi gonderen kisinin
// birkaç saniye beklemesini onlemek icin (bkz. index.ts baslangic).
export function warmUpNsfwModel(): void {
  getModel().catch((err) => console.error("nsfw model yuklenemedi:", err));
}

// Verilen resim buffer'inin +18 icerik olup olmadigini dondurur. Herhangi
// bir hata durumunda (bozuk resim, model hatasi vb.) GUVENLI TARAFTA kalip
// false donuyoruz - yani otomatik tespit basarisiz olursa fotograf +18
// ISARETLENMEDEN gonderilir (eski manuel anahtarin varsayilani da buydu).
export async function isImageAdult(buffer: Buffer): Promise<boolean> {
  try {
    const image = await Jimp.read(buffer);
    image.resize({ w: 224, h: 224 });
    const { data, width, height } = image.bitmap;
    const pixels = new Int32Array(width * height * 3);
    let j = 0;
    for (let i = 0; i < data.length; i += 4) {
      pixels[j++] = data[i];
      pixels[j++] = data[i + 1];
      pixels[j++] = data[i + 2];
    }
    const tensor = tf.tensor3d(pixels, [height, width, 3], "int32");
    try {
      const model = await getModel();
      const predictions = await model.classify(tensor);
      return predictions.some((p) => ADULT_CLASSES.has(p.className) && p.probability >= ADULT_THRESHOLD);
    } finally {
      tensor.dispose();
    }
  } catch (err) {
    console.error("nsfw tespiti basarisiz, +18 isaretlenmeden gonderiliyor:", err);
    return false;
  }
}
