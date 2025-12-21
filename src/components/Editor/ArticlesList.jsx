import React from 'react';
import { Edit2, Trash2, Check, Download, BookOpen } from 'lucide-react';
import Alert from '../UI/Alert';
import { ARTICLE_SECTIONS } from '../../services/aiApi';
import { groupArticlesBySection, SECTION_ORDER } from '../../utils/languageDetection';

const ArticleItem = ({ article, index, globalIndex, isEditing, onEdit, onUpdate, onDelete, onStopEditing }) => {
  return (
    <div className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition bg-white">
      <div className="flex items-start gap-4">
        <div className="bg-indigo-100 text-indigo-600 rounded-lg w-12 h-12 flex items-center justify-center font-bold text-lg flex-shrink-0">
          {globalIndex + 1}
        </div>

        {isEditing ? (
          <div className="flex-1 space-y-3">
            <input
              value={article.title}
              onChange={(e) => onUpdate(article.id, 'title', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              placeholder="Название статьи"
            />
            <input
              value={article.author}
              onChange={(e) => onUpdate(article.id, 'author', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              placeholder="Автор"
            />
            <select
              value={article.section || ARTICLE_SECTIONS[0]}
              onChange={(e) => onUpdate(article.id, 'section', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
            >
              {ARTICLE_SECTIONS.map(section => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
            <button
              onClick={onStopEditing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Check className="inline mr-2" size={16} />
              Сохранить
            </button>
          </div>
        ) : (
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              {article.title}
            </h3>
            <p className="text-gray-600 mb-2">
              Автор: {article.author}
              <span className={`ml-3 px-2 py-1 rounded text-xs ${
                article.language === 'cyrillic'
                  ? 'bg-blue-100 text-blue-700'
                  : article.language === 'kazakh'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {article.language === 'cyrillic'
                  ? 'Русский'
                  : article.language === 'kazakh'
                  ? 'Қазақша'
                  : 'English'}
              </span>
            </p>
            <p className="text-sm text-gray-500">{article.file.name}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onEdit(article.id)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            title="Редактировать"
          >
            <Edit2 size={20} />
          </button>
          <button
            onClick={() => onDelete(article.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
            title="Удалить"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ title, count }) => (
  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-xl shadow-md mb-4">
    <div className="flex items-center gap-3">
      <BookOpen size={24} />
      <h3 className="text-xl font-bold">{title}</h3>
      <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
        {count} {count === 1 ? 'статья' : count < 5 ? 'статьи' : 'статей'}
      </span>
    </div>
  </div>
);

const ArticlesList = ({
  articles,
  editingArticle,
  onEditArticle,
  onUpdateArticle,
  onDeleteArticle,
  onStopEditing,
  onGeneratePDF,
  isProcessing,
  coverPage,
  descriptionPage,
  finalPage
}) => {
  const missingPages = [];
  if (!coverPage) missingPages.push('Титульный лист');
  if (!descriptionPage) missingPages.push('Описание журнала и редакции');
  if (!finalPage) missingPages.push('Заключительную страницу');

  const canGeneratePDF = coverPage && descriptionPage && finalPage;

  // Group articles by section
  const groupedArticles = groupArticlesBySection(articles);
  const hasArticles = articles.length > 0;

  // Calculate global index for each article
  let globalIndex = 0;

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Статьи ({articles.length})
      </h2>

      {hasArticles ? (
        <div className="space-y-6">
          {SECTION_ORDER.map(sectionName => {
            const sectionArticles = groupedArticles[sectionName];
            if (!sectionArticles || sectionArticles.length === 0) return null;

            return (
              <div key={sectionName} className="mb-8">
                <SectionHeader title={sectionName} count={sectionArticles.length} />
                <div className="space-y-4 ml-2">
                  {sectionArticles.map((article) => {
                    const currentGlobalIndex = globalIndex;
                    globalIndex++;
                    return (
                      <ArticleItem
                        key={article.id}
                        article={article}
                        index={currentGlobalIndex}
                        globalIndex={currentGlobalIndex}
                        isEditing={editingArticle === article.id}
                        onEdit={onEditArticle}
                        onUpdate={onUpdateArticle}
                        onDelete={onDeleteArticle}
                        onStopEditing={onStopEditing}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
          <p>Загрузите статьи для начала работы</p>
        </div>
      )}

      <div className="mt-8 flex gap-4">
        <button
          onClick={onGeneratePDF}
          disabled={isProcessing || !canGeneratePDF || !hasArticles}
          className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          <Download className="inline mr-2" size={20} />
          {isProcessing ? 'Генерация...' : 'Сгенерировать PDF'}
        </button>
      </div>

      {!canGeneratePDF && hasArticles && (
        <div className="mt-4">
          <Alert type="warning" title="Для генерации PDF необходимо загрузить:">
            <ul className="list-disc list-inside space-y-1">
              {missingPages.map(page => (
                <li key={page}>{page}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
    </div>
  );
};

export default ArticlesList;
