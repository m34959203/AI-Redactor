import React from 'react';
import { Edit2, Trash2, Check, Download, BookOpen, AlertTriangle, User, Sparkles, RefreshCw, RotateCcw } from 'lucide-react';
import Alert from '../UI/Alert';
import { ARTICLE_SECTIONS } from '../../services/aiApi';
import { groupArticlesBySection, SECTION_ORDER, NEEDS_REVIEW_SECTION } from '../../utils/languageDetection';
import { CONFIDENCE_THRESHOLDS } from '../../constants/sections';

/**
 * Confidence indicator component
 */
const ConfidenceIndicator = ({ confidence, needsReview, manuallyClassified, reasoning }) => {
  if (manuallyClassified) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-100 text-blue-700"
        title="Раздел выбран вручную"
      >
        <User size={12} />
        Ручной выбор
      </span>
    );
  }

  if (needsReview) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-100 text-red-700 animate-pulse"
        title="Требуется проверка классификации"
      >
        <AlertTriangle size={12} />
        Требует проверки
      </span>
    );
  }

  // AI confidence percentage removed - only show manual selection and needs review indicators
  return null;
};

const ArticleItem = ({ article, index, globalIndex, isEditing, onEdit, onUpdate, onDelete, onStopEditing, onRetryClassification, isRetrying }) => {
  const needsAttention = article.needsReview || (article.sectionConfidence && article.sectionConfidence < CONFIDENCE_THRESHOLDS.MEDIUM);
  const canRetry = (article.needsReview || article.section === NEEDS_REVIEW_SECTION) && !article.manuallyClassified;

  return (
    <div className={`border rounded-xl p-6 hover:shadow-md transition bg-white ${
      needsAttention ? 'border-orange-300 bg-orange-50/30' : 'border-gray-200'
    }`}>
      <div className="flex items-start gap-4">
        <div className={`rounded-lg w-12 h-12 flex items-center justify-center font-bold text-lg flex-shrink-0 ${
          needsAttention ? 'bg-orange-100 text-orange-600' : 'bg-indigo-100 text-indigo-600'
        }`}>
          {globalIndex + 1}
        </div>

        {isEditing ? (
          <div className="flex-1 space-y-3">
            <input
              value={article.title}
              onChange={(e) => onUpdate(article.id, 'title', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Название статьи"
            />
            <input
              value={article.author}
              onChange={(e) => onUpdate(article.id, 'author', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Автор"
            />
            <div className="relative">
              <select
                value={article.section || ARTICLE_SECTIONS[0]}
                onChange={(e) => onUpdate(article.id, 'section', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {ARTICLE_SECTIONS.map(section => (
                  <option key={section} value={section}>{section}</option>
                ))}
              </select>
              {article.sectionReasoning && !article.manuallyClassified && (
                <p className="mt-1 text-xs text-gray-500 italic">
                  AI обоснование: {article.sectionReasoning}
                </p>
              )}
            </div>
            <button
              onClick={onStopEditing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
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
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-gray-600">Автор: {article.author}</span>
              <span className={`px-2 py-1 rounded text-xs ${
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
              <ConfidenceIndicator
                confidence={article.sectionConfidence}
                needsReview={article.needsReview}
                manuallyClassified={article.manuallyClassified}
                reasoning={article.sectionReasoning}
              />
            </div>
            <p className="text-sm text-gray-500">{article.file.name}</p>
          </div>
        )}

        <div className="flex gap-2">
          {canRetry && onRetryClassification && (
            <button
              onClick={() => onRetryClassification(article.id)}
              disabled={isRetrying}
              className={`p-2 rounded-lg transition ${
                isRetrying
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-purple-600 hover:bg-purple-50'
              }`}
              title="Повторить AI классификацию"
            >
              <RotateCcw size={20} className={isRetrying ? 'animate-spin' : ''} />
            </button>
          )}
          <button
            onClick={() => onEdit(article.id)}
            className={`p-2 rounded-lg transition ${
              needsAttention
                ? 'text-orange-600 hover:bg-orange-100'
                : 'text-blue-600 hover:bg-blue-50'
            }`}
            title={needsAttention ? 'Редактировать (требуется проверка)' : 'Редактировать'}
          >
            <Edit2 size={20} />
          </button>
          <button
            onClick={() => onDelete(article.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
            title="Удалить"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ title, count, onRetryAll, isRetrying }) => {
  const isNeedsReview = title === NEEDS_REVIEW_SECTION;

  return (
    <div className={`px-6 py-4 rounded-xl shadow-md mb-4 ${
      isNeedsReview
        ? 'bg-gradient-to-r from-orange-500 to-red-500'
        : 'bg-gradient-to-r from-indigo-600 to-purple-600'
    } text-white`}>
      <div className="flex items-center gap-3 flex-wrap">
        {isNeedsReview ? <AlertTriangle size={24} /> : <BookOpen size={24} />}
        <h3 className="text-xl font-bold">{title}</h3>
        <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
          {count} {count === 1 ? 'статья' : count < 5 ? 'статьи' : 'статей'}
        </span>
        {isNeedsReview && (
          <>
            <span className="text-sm opacity-80">
              — выберите раздел для каждой статьи
            </span>
            {onRetryAll && (
              <button
                onClick={onRetryAll}
                disabled={isRetrying}
                className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-lg transition font-medium ${
                  isRetrying
                    ? 'bg-white/20 cursor-not-allowed'
                    : 'bg-white/30 hover:bg-white/40'
                }`}
                title="Повторить AI анализ для всех статей в этом разделе"
              >
                <RefreshCw size={18} className={isRetrying ? 'animate-spin' : ''} />
                {isRetrying ? 'Анализ...' : 'Повторить анализ'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

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
  finalPage,
  onRetryClassification,
  onRetryAllClassification,
  retryingArticleId
}) => {
  const missingPages = [];
  if (!coverPage) missingPages.push('Титульный лист');
  if (!descriptionPage) missingPages.push('Описание журнала и редакции');
  if (!finalPage) missingPages.push('Заключительную страницу');

  const canGeneratePDF = coverPage && descriptionPage && finalPage;

  // Group articles by section
  const groupedArticles = groupArticlesBySection(articles);
  const hasArticles = articles.length > 0;

  // Statistics
  const needsReviewCount = articles.filter(a => a.needsReview || a.section === NEEDS_REVIEW_SECTION).length;
  const lowConfidenceCount = articles.filter(a =>
    !a.needsReview &&
    a.section !== NEEDS_REVIEW_SECTION &&
    a.sectionConfidence &&
    a.sectionConfidence < CONFIDENCE_THRESHOLDS.MEDIUM
  ).length;
  const manuallyClassifiedCount = articles.filter(a => a.manuallyClassified).length;
  const hasUnreviewedArticles = needsReviewCount > 0;

  // Calculate global index for each article
  let globalIndex = 0;

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          Статьи ({articles.length})
        </h2>

        {hasArticles && (
          <div className="flex flex-wrap gap-3 text-sm">
            {manuallyClassifiedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                <User size={14} />
                {manuallyClassifiedCount} вручную
              </span>
            )}
            {needsReviewCount > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 animate-pulse">
                <AlertTriangle size={14} />
                {needsReviewCount} требуют проверки
              </span>
            )}
            {lowConfidenceCount > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700">
                <Sparkles size={14} />
                {lowConfidenceCount} с низкой уверенностью
              </span>
            )}
            {needsReviewCount === 0 && lowConfidenceCount === 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700">
                <Check size={14} />
                Все статьи классифицированы
              </span>
            )}
          </div>
        )}
      </div>

      {hasArticles ? (
        <div className="space-y-6">
          {/* Regular sections */}
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
                        onRetryClassification={onRetryClassification}
                        isRetrying={retryingArticleId === article.id}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Needs Review section (at the end) */}
          {groupedArticles[NEEDS_REVIEW_SECTION] && groupedArticles[NEEDS_REVIEW_SECTION].length > 0 && (
            <div className="mb-8">
              <SectionHeader
                title={NEEDS_REVIEW_SECTION}
                count={groupedArticles[NEEDS_REVIEW_SECTION].length}
                onRetryAll={onRetryAllClassification}
                isRetrying={retryingArticleId === 'all'}
              />
              <div className="space-y-4 ml-2">
                {groupedArticles[NEEDS_REVIEW_SECTION].map((article) => {
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
                      onRetryClassification={onRetryClassification}
                      isRetrying={retryingArticleId === article.id || retryingArticleId === 'all'}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
          <p>Загрузите статьи для начала работы</p>
        </div>
      )}

      {!canGeneratePDF && hasArticles && (
        <div className="mt-8">
          <Alert type="warning" title="Для генерации PDF необходимо загрузить:">
            <ul className="list-disc list-inside space-y-1">
              {missingPages.map(page => (
                <li key={page}>{page}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      <div className="mt-4 flex gap-4">
        <button
          onClick={onGeneratePDF}
          disabled={isProcessing || !hasArticles}
          className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          <Download className="inline mr-2" size={20} />
          {isProcessing ? 'Генерация...' : 'Сгенерировать PDF'}
        </button>
      </div>

      {hasUnreviewedArticles && hasArticles && (
        <div className="mt-4">
          <Alert type="error" title="Внимание: есть статьи требующие классификации">
            <p>
              {needsReviewCount} {needsReviewCount === 1 ? 'статья требует' : 'статей требуют'} ручного выбора раздела.
              Откройте редактирование каждой статьи и выберите подходящий раздел перед генерацией PDF.
            </p>
          </Alert>
        </div>
      )}

      {lowConfidenceCount > 0 && !hasUnreviewedArticles && hasArticles && (
        <div className="mt-4">
          <Alert type="info" title="Рекомендация: проверьте классификацию">
            <p>
              AI классифицировал {lowConfidenceCount} {lowConfidenceCount === 1 ? 'статью' : 'статей'} с низкой уверенностью.
              Рекомендуем проверить правильность выбранных разделов.
            </p>
          </Alert>
        </div>
      )}
    </div>
  );
};

export default ArticlesList;
