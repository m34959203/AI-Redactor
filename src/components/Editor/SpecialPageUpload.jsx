import React from 'react';
import { Upload, CheckCircle } from 'lucide-react';

const SpecialPageCard = ({
  title,
  description,
  number,
  color,
  page,
  onUpload,
  onDelete,
  inputRef
}) => {
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6">
      <div className="text-center">
        <div className={`bg-${color}-100 text-${color}-600 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3`}>
          <span className="font-bold text-lg">{number}</span>
        </div>
        <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-4">{description}</p>

        {page ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
            <CheckCircle className="text-green-600 mx-auto mb-2" size={24} />
            <p className="text-sm text-green-800 font-medium truncate">{page.name}</p>
            <button
              onClick={onDelete}
              className="mt-2 text-xs text-red-600 hover:text-red-800"
            >
              Удалить
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className={`w-full bg-${color}-600 text-white px-4 py-2 rounded-lg hover:bg-${color}-700 text-sm`}
          >
            <Upload className="inline mr-2" size={16} />
            Загрузить
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf"
          onChange={(e) => onUpload(e.target.files[0])}
          className="hidden"
        />
      </div>
    </div>
  );
};

const SpecialPageUpload = ({
  coverPage,
  descriptionPage,
  finalPage,
  onCoverUpload,
  onDescriptionUpload,
  onFinalUpload,
  coverInputRef,
  descInputRef,
  finalInputRef
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Структура журнала</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SpecialPageCard
          title="Титульный лист"
          description="Обложка журнала"
          number="1"
          color="blue"
          page={coverPage}
          onUpload={onCoverUpload}
          onDelete={() => onCoverUpload(null)}
          inputRef={coverInputRef}
        />

        <SpecialPageCard
          title="Описание и редакция"
          description="О журнале и редколлегии"
          number="2"
          color="purple"
          page={descriptionPage}
          onUpload={onDescriptionUpload}
          onDelete={() => onDescriptionUpload(null)}
          inputRef={descInputRef}
        />

        <SpecialPageCard
          title="Заключительная страница"
          description="После содержания"
          number="∞"
          color="orange"
          page={finalPage}
          onUpload={onFinalUpload}
          onDelete={() => onFinalUpload(null)}
          inputRef={finalInputRef}
        />
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Структура выпуска:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Титульный лист (обязательно)</li>
              <li>Описание журнала и редакции (обязательно)</li>
              <li>Статьи с автоматическим содержанием</li>
              <li>Заключительная страница (обязательно)</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpecialPageUpload;
