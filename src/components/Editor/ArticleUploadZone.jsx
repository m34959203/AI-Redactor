import React from 'react';
import { Upload } from 'lucide-react';

const ArticleUploadZone = ({ onUpload, fileInputRef }) => {
  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    onUpload(files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    onUpload(files);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Загрузка статей</h2>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-3 border-dashed border-indigo-300 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition"
      >
        <Upload className="mx-auto mb-4 text-indigo-600" size={48} />
        <p className="text-lg font-semibold text-gray-700 mb-2">
          Перетащите файлы или нажмите для выбора
        </p>
        <p className="text-gray-500">Поддерживаются .docx файлы до 50 МБ</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".docx"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
};

export default ArticleUploadZone;
