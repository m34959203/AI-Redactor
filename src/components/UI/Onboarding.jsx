import React, { useState } from 'react';
import { Upload, FileText, CheckSquare, Eye, Archive, ChevronRight, ChevronLeft, X } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    title: 'Загрузите статьи',
    description: 'Перетащите файлы .docx в зону загрузки или нажмите для выбора. Поддерживаются статьи на русском, английском и казахском языках.',
    color: 'bg-blue-500',
  },
  {
    icon: FileText,
    title: 'AI извлечёт метаданные',
    description: 'Искусственный интеллект автоматически определит название статьи, автора и язык текста.',
    color: 'bg-purple-500',
  },
  {
    icon: CheckSquare,
    title: 'Проверьте орфографию',
    description: 'На вкладке "Орфография" AI найдёт и подсветит возможные ошибки в тексте.',
    color: 'bg-amber-500',
  },
  {
    icon: Eye,
    title: 'Получите рецензию',
    description: 'AI проанализирует статью по 5 критериям: структура, логика, оригинальность, стиль и актуальность.',
    color: 'bg-green-500',
  },
  {
    icon: Archive,
    title: 'Создайте выпуск',
    description: 'Сгенерируйте PDF-сборник всех статей с обложкой, оглавлением и нумерацией страниц. Выпуски сохраняются в архив.',
    color: 'bg-indigo-500',
  },
];

const Onboarding = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const step = STEPS[currentStep];
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">
            Добро пожаловать в AI-Редактор
          </h2>
          <button
            onClick={handleSkip}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            aria-label="Закрыть"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <div className={`w-20 h-20 ${step.color} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}>
            <Icon size={40} className="text-white" />
          </div>

          <h3 className="text-2xl font-bold text-gray-800 mb-3">
            {step.title}
          </h3>

          <p className="text-gray-600 text-lg leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pb-4">
          {STEPS.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`w-2.5 h-2.5 rounded-full transition ${
                index === currentStep ? 'bg-indigo-600 w-8' : 'bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Шаг ${index + 1}`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition font-medium ${
              currentStep === 0
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            <ChevronLeft size={18} />
            Назад
          </button>

          <span className="text-sm text-gray-500">
            {currentStep + 1} из {STEPS.length}
          </span>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
          >
            {currentStep === STEPS.length - 1 ? 'Начать работу' : 'Далее'}
            {currentStep < STEPS.length - 1 && <ChevronRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
