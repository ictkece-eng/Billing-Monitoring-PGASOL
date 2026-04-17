// Utilitas sederhana untuk OCR berbasis Tesseract.js
import Tesseract from 'tesseract.js';

export async function ocrImageToText(file: File): Promise<string> {
  // Hanya support gambar, PDF perlu ekstensi khusus
  return new Promise((resolve, reject) => {
    Tesseract.recognize(file, 'ind', {
      logger: m => console.log(m),
    })
      .then(({ data: { text } }) => resolve(text))
      .catch(reject);
  });
}
