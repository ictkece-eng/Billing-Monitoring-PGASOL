import React, { useState } from 'react';
import ImportNotaPajak from './ImportNotaPajak';
import { ocrImageToText } from '../services/ocrService';
import { parseNotaPajakToPembatalan, NotaPembatalanData } from '../services/notaPembatalanParser';
import { exportNotaPembatalanToPDF } from '../services/notaPembatalanExport';

const NotaPembatalanMenu: React.FC = () => {
  const [ocrText, setOcrText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<NotaPembatalanData | null>(null);

  const handleFileLoaded = async (file: File, preview: { src: string; name: string }) => {
    setLoading(true);
    setError(null);
    setOcrText('');
    setParsed(null);
    try {
      const text = await ocrImageToText(file);
      setOcrText(text);
      const parsedData = parseNotaPajakToPembatalan(text);
      setParsed(parsedData);
    } catch (e: any) {
      setError('Gagal membaca gambar. Pastikan gambar jelas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Nota Pembatalan</h2>
      <p>Silakan import Nota Pajak untuk membuat Nota Pembatalan.</p>
      <ImportNotaPajak onFileLoaded={handleFileLoaded} />
      {loading && <div>Membaca gambar, mohon tunggu...</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {ocrText && (
        <div style={{ marginTop: 16 }}>
          <b>Hasil OCR:</b>
          <pre style={{ background: '#f8f8f8', padding: 12, borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>{ocrText}</pre>
        </div>
      )}
      {parsed && (
        <div style={{ marginTop: 24, border: '1px solid #ccc', borderRadius: 8, padding: 16, background: '#f9f9f9', maxWidth: 600 }}>
          <h3>Preview Nota Pembatalan</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td><b>Nomor</b></td><td>{parsed.nomor}</td></tr>
              <tr><td><b>Tanggal</b></td><td>{parsed.tanggal}</td></tr>
              <tr><td><b>Penerima Jasa</b></td><td>{parsed.penerimaNama}</td></tr>
              <tr><td><b>Alamat Penerima</b></td><td>{parsed.penerimaAlamat}</td></tr>
              <tr><td><b>NPWP Penerima</b></td><td>{parsed.penerimaNPWP}</td></tr>
              <tr><td><b>Pemberi Jasa</b></td><td>{parsed.pemberiNama}</td></tr>
              <tr><td><b>Alamat Pemberi</b></td><td>{parsed.pemberiAlamat}</td></tr>
              <tr><td><b>NPWP Pemberi</b></td><td>{parsed.pemberiNPWP}</td></tr>
              <tr><td><b>Jasa</b></td><td>{parsed.jasa}</td></tr>
              <tr><td><b>Nilai</b></td><td>{parsed.nilai}</td></tr>
            </tbody>
          </table>
          <button style={{ marginTop: 16 }} onClick={() => exportNotaPembatalanToPDF(parsed)}>Download PDF</button>
        </div>
      )}
    </div>
  );
};

export default NotaPembatalanMenu;
