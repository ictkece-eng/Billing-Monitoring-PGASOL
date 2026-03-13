
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
    <>
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div className="modal fade show d-block" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <h5 className="modal-title">Tambah Data Budget</h5>
              <button type="button" className="btn-close" aria-label="Tutup" onClick={onClose} />
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label small text-uppercase text-muted fw-bold">Nama User</label>
            <input
              type="text"
              required
              className="form-control"
              placeholder="Contoh: Arif Shalahuddin"
              value={formData.namaUser}
              onChange={(e) => setFormData({ ...formData, namaUser: e.target.value })}
            />
                </div>

                <div className="mb-3">
                  <label className="form-label small text-uppercase text-muted fw-bold">Tim / Departemen</label>
            <input
              type="text"
              required
              className="form-control"
              placeholder="Contoh: PO Performance"
              value={formData.tim}
              onChange={(e) => setFormData({ ...formData, tim: e.target.value })}
            />
                </div>

                <div className="row g-3 mb-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-uppercase text-muted fw-bold">Periode</label>
              <input
                type="text"
                required
                className="form-control"
                placeholder="Jan-25"
                value={formData.periode}
                onChange={(e) => setFormData({ ...formData, periode: e.target.value })}
              />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small text-uppercase text-muted fw-bold">Nilai Tagihan</label>
              <input
                type="number"
                required
                className="form-control font-monospace"
                placeholder="0"
                value={formData.nilaiTagihan}
                onChange={(e) => setFormData({ ...formData, nilaiTagihan: e.target.value })}
              />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label small text-uppercase text-muted fw-bold">Status Billing (Kolom Pivot)</label>
            <select
              className="form-select"
              value={formData.status2}
              onChange={(e) => setFormData({ ...formData, status2: e.target.value as Status2Type })}
            >
              {STATUS_COLS.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={onClose} className="btn btn-outline-secondary">
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default BudgetInputForm;
