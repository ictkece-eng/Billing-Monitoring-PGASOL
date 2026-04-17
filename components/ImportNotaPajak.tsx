import React, { useRef, useState } from 'react';

interface NotaPajakPreview {
  src: string;
  name: string;
}

const ImportNotaPajak: React.FC<{ onFileLoaded: (file: File, preview: NotaPajakPreview) => void }> = ({ onFileLoaded }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<NotaPajakPreview | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreview({ src: ev.target?.result as string, name: file.name });
      onFileLoaded(file, { src: ev.target?.result as string, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ margin: '16px 0' }}>
      <input
        type="file"
        accept="image/*,application/pdf"
        ref={inputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button onClick={() => inputRef.current?.click()}>Import Nota Pajak (Gambar/PDF)</button>
      {preview && (
        <div style={{ marginTop: 16 }}>
          <div><b>Preview:</b> {preview.name}</div>
          {preview.src.startsWith('data:image') && (
            <img src={preview.src} alt="preview" style={{ maxWidth: 400, maxHeight: 300, border: '1px solid #ccc' }} />
          )}
          {/* Untuk PDF bisa gunakan PDF.js atau tampilkan link download */}
          {preview.src.startsWith('data:application/pdf') && (
            <a href={preview.src} target="_blank" rel="noopener noreferrer">Lihat PDF</a>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportNotaPajak;
