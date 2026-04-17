// Utilitas parsing hasil OCR Nota Pajak ke data Nota Pembatalan
export interface NotaPembatalanData {
  nomor: string;
  tanggal: string;
  penerimaNama: string;
  penerimaAlamat: string;
  penerimaNPWP: string;
  pemberiNama: string;
  pemberiAlamat: string;
  pemberiNPWP: string;
  jasa: string;
  nilai: string;
}

export function parseNotaPajakToPembatalan(ocrText: string): NotaPembatalanData {
  // Parsing sederhana berbasis regex, bisa diimprove sesuai kebutuhan
  const nomor = ocrText.match(/Faktur Pajak Nomor\s*:\s*([\d.\-\/]+)/i)?.[1] || '';
  const tanggal = ocrText.match(/Tanggal\s*:\s*([\d]+\s*\w+\s*\d{4})/i)?.[1] || '';
  const penerimaNama = ocrText.match(/Nama\s*:\s*([A-Z0-9 .,&\-]+)/i)?.[1] || '';
  const penerimaAlamat = ocrText.match(/Alamat\s*:\s*([A-Z0-9 .,&\-\/]+)/i)?.[1] || '';
  const penerimaNPWP = ocrText.match(/NPWP\s*:?\s*([\d.\- ]+)/i)?.[1] || '';
  const pemberiNama = ocrText.match(/Kepada Pemberi Jasa Pajak\s*Nama\s*:\s*([A-Z0-9 .,&\-]+)/i)?.[1] || '';
  const pemberiAlamat = ocrText.match(/Kepada Pemberi Jasa Pajak[\s\S]*?Alamat\s*:\s*([A-Z0-9 .,&\-\/]+)/i)?.[1] || '';
  const pemberiNPWP = ocrText.match(/Kepada Pemberi Jasa Pajak[\s\S]*?NPWP\s*:?\s*([\d.\- ]+)/i)?.[1] || '';
  const jasa = ocrText.match(/Jasa[\s\S]*?([A-Z0-9 .,&\-()/]+)\s+Rp/i)?.[1] || '';
  const nilai = ocrText.match(/Rp[ .]*([\d.,]+)/i)?.[1] || '';
  return {
    nomor,
    tanggal,
    penerimaNama,
    penerimaAlamat,
    penerimaNPWP,
    pemberiNama,
    pemberiAlamat,
    pemberiNPWP,
    jasa,
    nilai,
  };
}
