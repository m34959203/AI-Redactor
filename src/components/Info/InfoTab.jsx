import React, { useState } from 'react';
import { BookOpen, Users, FileText, Mail, Globe, Award } from 'lucide-react';

const InfoTab = () => {
  const [activeSection, setActiveSection] = useState('rules');

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
        <BookOpen className="text-indigo-600" size={28} />
        Информация о журнале
      </h2>

      {/* Sub-navigation */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveSection('rules')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeSection === 'rules'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <FileText className="inline mr-2" size={18} />
          Правила публикации
        </button>
        <button
          onClick={() => setActiveSection('editorial')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            activeSection === 'editorial'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Users className="inline mr-2" size={18} />
          Редакция
        </button>
      </div>

      {/* Publication Rules Section */}
      {activeSection === 'rules' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
              <Award size={20} />
              Требования к оформлению статей
            </h3>
            <div className="text-blue-900 space-y-3">
              <p className="font-medium">Формат документа:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Формат файла: Microsoft Word (.docx)</li>
                <li>Шрифт: Times New Roman, 12 пт</li>
                <li>Межстрочный интервал: 1,0 (одинарный)</li>
                <li>Поля: верхнее и нижнее — 3 см, левое и правое — 2,5 см</li>
                <li>Объем статьи: от 5 до 15 страниц</li>
              </ul>
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-purple-800 mb-4">
              Структура статьи
            </h3>
            <div className="text-purple-900 space-y-3">
              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li><strong>УДК</strong> — универсальная десятичная классификация</li>
                <li><strong>Название статьи</strong> — на языке статьи и английском</li>
                <li><strong>Сведения об авторах</strong> — ФИО, ученая степень, должность, организация, email</li>
                <li><strong>Аннотация</strong> — 150-200 слов на языке статьи и английском</li>
                <li><strong>Ключевые слова</strong> — 5-7 слов на языке статьи и английском</li>
                <li><strong>Основной текст</strong> — введение, методы, результаты, обсуждение, выводы</li>
                <li><strong>Список литературы</strong> — оформленный по ГОСТ или APA</li>
              </ol>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-amber-800 mb-4">
              Требования к списку литературы
            </h3>
            <div className="text-amber-900 space-y-3">
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Минимум 10 источников</li>
                <li>Не менее 30% — публикации за последние 5 лет</li>
                <li>Ссылки в тексте в квадратных скобках [1, с. 25]</li>
                <li>Самоцитирование — не более 20%</li>
                <li>Желательно наличие DOI для каждого источника</li>
              </ul>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-green-800 mb-4">
              Этические требования
            </h3>
            <div className="text-green-900 space-y-3">
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Оригинальность текста — не менее 70%</li>
                <li>Статья не должна быть опубликована ранее</li>
                <li>Все соавторы должны дать согласие на публикацию</li>
                <li>Конфликт интересов должен быть указан</li>
                <li>Источники финансирования должны быть раскрыты</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Editorial Board Section */}
      {activeSection === 'editorial' && (
        <div className="space-y-6">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-indigo-800 mb-4 flex items-center gap-2">
              <Globe size={20} />
              О журнале
            </h3>
            <div className="text-indigo-900 space-y-3">
              <p>
                <strong>Вестник ЖезУ</strong> — научный журнал, публикующий результаты
                фундаментальных и прикладных исследований в различных областях науки.
              </p>
              <p>Журнал индексируется в базах данных:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>РИНЦ (Российский индекс научного цитирования)</li>
                <li>Google Scholar</li>
                <li>Cyberleninka</li>
              </ul>
              <p className="mt-3">
                <strong>Периодичность:</strong> 4 выпуска в год (ежеквартально)
              </p>
              <p>
                <strong>Языки публикации:</strong> казахский, русский, английский
              </p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Users size={20} />
              Редакционная коллегия
            </h3>
            <div className="space-y-4">
              <div className="border-l-4 border-indigo-500 pl-4">
                <p className="font-semibold text-gray-800">Главный редактор</p>
                <p className="text-gray-600">д.н., профессор</p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <p className="font-semibold text-gray-800">Заместитель главного редактора</p>
                <p className="text-gray-600">к.н., доцент</p>
              </div>
              <div className="border-l-4 border-blue-500 pl-4">
                <p className="font-semibold text-gray-800">Ответственный секретарь</p>
                <p className="text-gray-600">к.н.</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-4 italic">
              * Полный состав редколлегии указан в печатной версии журнала
            </p>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-teal-800 mb-4 flex items-center gap-2">
              <Mail size={20} />
              Контакты редакции
            </h3>
            <div className="text-teal-900 space-y-2">
              <p><strong>Адрес:</strong> Республика Казахстан, г. Жезказган</p>
              <p><strong>Email:</strong> vestnik@example.kz</p>
              <p><strong>Телефон:</strong> +7 (7102) XX-XX-XX</p>
              <p className="mt-3 text-sm">
                Прием статей осуществляется круглогодично.
                Срок рассмотрения статьи — до 30 дней.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InfoTab;
