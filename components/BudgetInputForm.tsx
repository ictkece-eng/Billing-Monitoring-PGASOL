
import React, { useState } from 'react';
import { BudgetRecord, Status2Type } from '../types';
import { STATUS_COLS } from '../constants';

interface BudgetInputFormProps {
  onAdd: (record: BudgetRecord) => void;
  onClose: () => void;
}

const BudgetInputForm: React.FC<BudgetInputFormProps> = ({ onAdd, onClose }) => {
  const [formData, setFormData] = useState({
    namaUser: '',
    tim: '',
    periode: 'Jan-25',
    nilaiTagihan: '',
    status: 'On Progress' as BudgetRecord['status'],
    status2: 'Invoice Internal' as Status2Type,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.namaUser || !formData.tim || !formData.nilaiTagihan) {
      alert('Mohon lengkapi data yang wajib diisi.');
      return;
    }

    const newRecord: BudgetRecord = {
      id: Date.now().toString(),
      ...formData,
      nilaiTagihan: Number(formData.nilaiTagihan),
    };

    onAdd(newRecord);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">Tambah Data Budget</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Nama User</label>
            <input
              type="text"
              required
              className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Contoh: Arif Shalahuddin"
              value={formData.namaUser}
              onChange={(e) => setFormData({ ...formData, namaUser: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tim / Departemen</label>
            <input
              type="text"
              required
              className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Contoh: PO Performance"
              value={formData.tim}
              onChange={(e) => setFormData({ ...formData, tim: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Periode</label>
              <input
                type="text"
                required
                className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Jan-25"
                value={formData.periode}
                onChange={(e) => setFormData({ ...formData, periode: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Nilai Tagihan</label>
              <input
                type="number"
                required
                className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                placeholder="0"
                value={formData.nilaiTagihan}
                onChange={(e) => setFormData({ ...formData, nilaiTagihan: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status Billing (Kolom Pivot)</label>
            <select
              className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.status2}
              onChange={(e) => setFormData({ ...formData, status2: e.target.value as Status2Type })}
            >
              {STATUS_COLS.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
            >
              Simpan Data
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BudgetInputForm;
