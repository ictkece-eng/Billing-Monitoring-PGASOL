import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NotaPembatalanData } from './notaPembatalanParser';

export function exportNotaPembatalanToPDF(data: NotaPembatalanData) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Nota Pembatalan', 14, 18);
  doc.setFontSize(10);
  doc.text(`Nomor: ${data.nomor}`, 14, 28);
  doc.text(`Tanggal: ${data.tanggal}`, 120, 28);

  autoTable(doc, {
    startY: 36,
    body: [
      ['Penerima Jasa', data.penerimaNama],
      ['Alamat Penerima', data.penerimaAlamat],
      ['NPWP Penerima', data.penerimaNPWP],
      ['Pemberi Jasa', data.pemberiNama],
      ['Alamat Pemberi', data.pemberiAlamat],
      ['NPWP Pemberi', data.pemberiNPWP],
      ['Jasa', data.jasa],
      ['Nilai', data.nilai],
    ],
    theme: 'grid',
    styles: { fontSize: 10 },
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 120 } },
    showHead: 'never',
  });

  doc.save(`NotaPembatalan-${data.nomor || 'export'}.pdf`);
}
