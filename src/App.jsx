import React, { useRef, useEffect, useState } from 'react';
import Header from './components/UI/Header';
import Tabs from './components/UI/Tabs';
import LoadingOverlay from './components/UI/LoadingOverlay';
import ToastContainer from './components/UI/Toast';
import Onboarding from './components/UI/Onboarding';
import ConfirmDialog from './components/UI/ConfirmDialog';
import LimitExhaustedBanner from './components/UI/LimitExhaustedBanner';
import EditorTab from './components/Editor/EditorTab';
import SpellCheckTab from './components/SpellCheck/SpellCheckTab';
import ReviewTab from './components/Review/ReviewTab';
import ArchiveTab from './components/Archive/ArchiveTab';
import InfoTab from './components/Info/InfoTab';

import { useApp, useNotifications, useProcessing } from './context/AppContext';
import { analyzeArticle, analyzeArticlesBatch, extractMetadataWithAI, checkSpelling, reviewArticle, detectArticleSection, ARTICLE_SECTIONS, retryArticleClassification, batchRetryClassification } from './services/aiApi';
import { validatePageFile, validateArticleFile } from './utils/fileValidation';
import useTheme from './hooks/useTheme';
import { detectLanguage, detectArticleLanguage, sortArticlesBySectionAndLanguage, NEEDS_REVIEW_SECTION } from './utils/languageDetection';
import { CONFIDENCE_THRESHOLDS } from './constants/sections';
import { validatePdfRequirements, createIssue, generatePDF, generatePDFSmart, downloadPDF } from './utils/pdfGenerator';
import { convertDocxToText } from './utils/docxConverter';
import { addToArchive, getPdfBlob, removeFromArchive } from './utils/archiveStorage';
import { extractMetadataLocal } from './utils/localMetadataParser';

const App = () => {
  const { state, actions } = useApp();
  const { notifications, showSuccess, showError, removeNotification } = useNotifications();
  const { isProcessing, processingMessage, progressCurrent, progressTotal, setProcessing } = useProcessing();
  const { isDark, toggleTheme } = useTheme();

  const {
    articles,
    coverPage,
    descriptionPage,
    finalPage,
    activeTab,
    archive,
    editingArticle,
    spellCheckResults,
    reviewResult,
    hasSeenOnboarding,
  } = state;

  // Refs
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const descInputRef = useRef(null);
  const finalInputRef = useRef(null);

  // Local state for retry functionality
  const [retryingArticleId, setRetryingArticleId] = useState(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Удалить',
    variant: 'danger',
    onConfirm: () => {},
  });

  // Limit exhausted banner state
  const [limitExhausted, setLimitExhausted] = useState({
    isVisible: false,
    message: ''
  });

  const showLimitExhausted = (message) => {
    setLimitExhausted({ isVisible: true, message });
  };

  const hideLimitExhausted = () => {
    setLimitExhausted({ isVisible: false, message: '' });
  };

  const showConfirm = ({ title, message, confirmText = 'Удалить', variant = 'danger', onConfirm }) => {
    setConfirmDialog({ isOpen: true, title, message, confirmText, variant, onConfirm });
  };

  const hideConfirm = () => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  };

  // Special page upload handlers
  const handleSpecialPageUpload = async (file, type) => {
    if (!file) {
      switch (type) {
        case 'cover':
          actions.setCoverPage(null);
          break;
        case 'description':
          actions.setDescriptionPage(null);
          break;
        case 'final':
          actions.setFinalPage(null);
          break;
      }
      return;
    }

    const validation = validatePageFile(file);
    if (!validation.valid) {
      showError(validation.error);
      return;
    }

    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const pageData = {
      file,
      name: file.name,
      type: fileExt,
      uploadDate: new Date().toISOString(),
    };

    switch (type) {
      case 'cover':
        actions.setCoverPage(pageData);
        showSuccess('Титульный лист загружен');
        break;
      case 'description':
        actions.setDescriptionPage(pageData);
        showSuccess('Описание журнала загружено');
        break;
      case 'final':
        actions.setFinalPage(pageData);
        showSuccess('Заключительная страница загружена');
        break;
    }
  };

  // Articles upload handler - BATCH processing for maximum speed
  const handleArticlesUpload = async (files) => {
    const totalFiles = files.length;
    const startTime = Date.now();
    setProcessing(true, 'Подготовка файлов...', 0, totalFiles);
    const newArticles = [];
    const articlesForBatch = [];

    try {
      // Step 1: Read all files first (fast, local)
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProcessing(true, `Читаю файл ${i + 1} из ${totalFiles}...`, i, totalFiles);

        const validation = validateArticleFile(file);
        if (!validation.valid) {
          console.warn(`Skipping file ${file.name}: ${validation.error}`);
          continue;
        }

        let content;
        try {
          content = await convertDocxToText(file);
        } catch (error) {
          console.error('Error extracting text:', error);
          content = await file.text();
        }

        // Local metadata as fallback
        const localMetadata = extractMetadataLocal(file.name, content);

        articlesForBatch.push({
          file,
          fileName: file.name,
          content,
          localMetadata
        });
      }

      if (articlesForBatch.length === 0) {
        showError('Не удалось прочитать ни один файл');
        return;
      }

      // Step 2: Batch AI analysis (5 articles per request = 20x faster)
      const BATCH_SIZE = 5;
      const totalBatches = Math.ceil(articlesForBatch.length / BATCH_SIZE);
      let aiAvailable = true;
      let processedCount = 0;

      setProcessing(true, `Анализирую статьи...`, 0, articlesForBatch.length);

      for (let batchIndex = 0; batchIndex < totalBatches && aiAvailable; batchIndex++) {
        const batchStart = batchIndex * BATCH_SIZE;
        const batch = articlesForBatch.slice(batchStart, batchStart + BATCH_SIZE);

        // User-friendly progress message
        const progress = Math.min(batchStart + batch.length, articlesForBatch.length);
        setProcessing(true, `Анализирую статьи... (${progress} из ${articlesForBatch.length})`, batchStart, articlesForBatch.length);

        try {
          const batchInput = batch.map(a => ({ fileName: a.fileName, content: a.content }));
          const batchResults = await analyzeArticlesBatch(batchInput);

          // Merge AI results with local data
          for (let i = 0; i < batch.length; i++) {
            const articleData = batch[i];
            const aiResult = batchResults.find(r => r.fileName === articleData.fileName) || {};

            const title = aiResult.title || articleData.localMetadata.title;
            const author = aiResult.author || articleData.localMetadata.author;
            // Use improved language detection that checks title, author, and content
            const language = detectArticleLanguage(title, author, articleData.content);

            newArticles.push({
              id: Date.now() + Math.random() + i,
              file: articleData.file,
              title,
              author,
              language,
              section: aiResult.section || NEEDS_REVIEW_SECTION,
              sectionConfidence: aiResult.sectionConfidence || 0,
              needsReview: aiResult.needsReview !== false,
              sectionReasoning: aiResult.sectionReasoning,
              content: articleData.content,
              aiProcessed: true
            });
          }
        } catch (error) {
          console.error('Batch analysis error:', error);

          // Check for all providers exhausted - show big banner
          if (error.message?.includes('ALL_PROVIDERS_EXHAUSTED')) {
            aiAvailable = false;
            showLimitExhausted('Дневной лимит всех бесплатных AI-моделей (Gemini, Groq, OpenRouter) исчерпан. Подождите или обновите тариф.');
          }
          // Check for rate limit
          else if (error.message?.includes('RATE_LIMIT') || error.message?.includes('429')) {
            aiAvailable = false;
            showError('Сервер занят. Используем быстрый режим обработки.');
          }

          // Fallback to local data for this batch
          for (const articleData of batch) {
            const language = detectArticleLanguage(
              articleData.localMetadata.title,
              articleData.localMetadata.author,
              articleData.content
            );
            newArticles.push({
              id: Date.now() + Math.random(),
              file: articleData.file,
              title: articleData.localMetadata.title,
              author: articleData.localMetadata.author,
              language,
              section: NEEDS_REVIEW_SECTION,
              sectionConfidence: 0,
              needsReview: true,
              content: articleData.content,
              aiProcessed: false
            });
          }
        }

        processedCount = batchStart + batch.length;
      }

      const allArticles = [...articles, ...newArticles];
      const sortedArticles = sortArticlesBySectionAndLanguage(allArticles);

      actions.setArticles(sortedArticles);

      // Автоматическая проверка орфографии для загруженных статей
      if (newArticles.length > 0 && aiAvailable) {
        setProcessing(true, 'Проверяю орфографию...', 0, newArticles.length);
        const spellCheckResults = [];
        let spellCheckErrors = 0;

        for (let i = 0; i < newArticles.length; i++) {
          const article = newArticles[i];
          setProcessing(true, `Проверяю орфографию... (${i + 1} из ${newArticles.length})`, i, newArticles.length);

          try {
            const result = await checkSpelling(article.content, article.file.name);
            spellCheckResults.push(result);
            spellCheckErrors += result.totalErrors;
          } catch (error) {
            // Если rate limit или limit exceeded - прекращаем проверку орфографии
            if (error.message?.includes('Rate limit') || error.message?.includes('429') ||
                error.message?.startsWith('RATE_LIMIT') ||
                error.message?.includes('SPELL_CHECK_LIMIT') ||
                error.message?.includes('ALL_PROVIDERS_EXHAUSTED')) {
              console.warn('Spell check stopped due to rate limit');
              // Show banner for limit exhausted
              if (error.message?.includes('SPELL_CHECK_LIMIT') || error.message?.includes('ALL_PROVIDERS_EXHAUSTED')) {
                const parts = error.message.split('|');
                showLimitExhausted(parts[1] || 'Лимит AI исчерпан. Проверка орфографии приостановлена.');
              }
              break;
            }
            console.warn(`Spell check failed for ${article.file.name}:`, error.message);
          }
        }

        // Сохраняем результаты проверки орфографии
        if (spellCheckResults.length > 0) {
          actions.addSpellCheckResults(spellCheckResults);
        }

        // Формируем итоговое сообщение
        const elapsedTime = Math.round((Date.now() - startTime) / 1000);
        const needsClassification = newArticles.filter(a => a.needsReview).length;
        const classifiedCount = newArticles.length - needsClassification;

        let message = `Готово! ${newArticles.length} статей за ${elapsedTime} сек`;

        if (classifiedCount > 0) {
          message += `\n${classifiedCount} классифицированы автоматически`;
        }

        if (spellCheckResults.length > 0 && spellCheckErrors > 0) {
          message += `\n${spellCheckErrors} орфографических замечаний`;
        }

        if (needsClassification > 0) {
          message += `\n${needsClassification} требуют ручной проверки`;
        }

        showSuccess(message);
      } else {
        // Если AI недоступен - показываем только информацию о загрузке
        const elapsedTime = Math.round((Date.now() - startTime) / 1000);
        const needsClassification = newArticles.filter(a => a.needsReview).length;

        if (!aiAvailable) {
          showSuccess(`Загружено ${newArticles.length} статей за ${elapsedTime} сек (быстрый режим)\n${needsClassification} требуют классификации`);
        } else if (needsClassification > 0) {
          showSuccess(`Загружено ${newArticles.length} статей за ${elapsedTime} сек\n${needsClassification} требуют классификации`);
        } else {
          showSuccess(`Загружено ${newArticles.length} статей за ${elapsedTime} сек`);
        }
      }
    } catch (error) {
      console.error('Error uploading articles:', error);
      showError('Ошибка при загрузке статей: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  // Article management
  const updateArticle = (id, field, value) => {
    const updates = { [field]: value };
    // Пересчитываем язык при изменении названия или автора
    if (field === 'title' || field === 'author') {
      const article = articles.find(a => a.id === id);
      if (article) {
        const newTitle = field === 'title' ? value : article.title;
        const newAuthor = field === 'author' ? value : article.author;
        // Use improved detection that checks all sources for Kazakh
        updates.language = detectArticleLanguage(newTitle, newAuthor, article.content);
      }
    }
    // When section is manually changed, mark as manually reviewed
    if (field === 'section') {
      updates.needsReview = false;
      updates.sectionConfidence = 1.0; // Manual selection = 100% confidence
      updates.manuallyClassified = true;
    }
    actions.updateArticle(id, updates);

    // Re-sort if title, author or section changed
    if (field === 'title' || field === 'author' || field === 'section') {
      const updated = articles.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      );
      actions.setArticles(sortArticlesBySectionAndLanguage(updated));
    }
  };

  const deleteArticle = (id) => {
    const article = articles.find(a => a.id === id);
    showConfirm({
      title: 'Удаление статьи',
      message: `Вы уверены, что хотите удалить статью "${article?.title || 'Без названия'}"? Это действие нельзя отменить.`,
      confirmText: 'Удалить',
      variant: 'danger',
      onConfirm: () => {
        actions.deleteArticle(id);
        showSuccess('Статья удалена');
      }
    });
  };

  // PDF Generation
  const handleGeneratePDF = async () => {
    const validation = validatePdfRequirements(coverPage, descriptionPage, finalPage);

    if (!validation.valid) {
      showError('Загрузите все необходимые страницы:\n' + validation.missingPages.join(', '));
      return;
    }

    if (articles.length === 0) {
      showError('Загрузите хотя бы одну статью');
      return;
    }

    setProcessing(true, 'Генерация PDF...');

    try {
      const issue = createIssue(articles, coverPage, descriptionPage, finalPage);

      const { blob: pdfBlob } = await generatePDFSmart(
        issue,
        articles,
        coverPage,
        descriptionPage,
        finalPage,
        (progress) => {
          setProcessing(true, progress.message);
        }
      );

      const archivedIssue = await addToArchive(issue, pdfBlob);
      actions.addToArchive(archivedIssue);

      downloadPDF(pdfBlob, `${issue.name.replace(/\s+/g, '_')}.pdf`);

      showSuccess(`PDF успешно сгенерирован! ${articles.length} статей в выпуске.`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      showError('Ошибка при генерации PDF: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  // Archive handlers
  const handleDownloadFromArchive = async (issueId) => {
    setProcessing(true, 'Загрузка PDF из архива...');

    try {
      const pdfBlob = await getPdfBlob(issueId);
      if (pdfBlob) {
        const issue = archive.find((i) => i.id === issueId);
        const fileName = issue ? `${issue.name.replace(/\s+/g, '_')}.pdf` : 'journal.pdf';
        downloadPDF(pdfBlob, fileName);
        showSuccess('Файл скачан');
      } else {
        showError('PDF файл не найден в архиве');
      }
    } catch (error) {
      console.error('Error downloading from archive:', error);
      showError('Ошибка при загрузке из архива');
    } finally {
      setProcessing(false);
    }
  };

  const handleViewFromArchive = async (issueId) => {
    setProcessing(true, 'Открытие PDF...');

    try {
      const pdfBlob = await getPdfBlob(issueId);
      if (pdfBlob) {
        const url = URL.createObjectURL(pdfBlob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        showError('PDF файл не найден в архиве');
      }
    } catch (error) {
      console.error('Error viewing from archive:', error);
      showError('Ошибка при открытии PDF');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteFromArchive = async (issueId) => {
    const issue = archive.find(i => i.id === issueId);
    showConfirm({
      title: 'Удаление выпуска',
      message: `Вы уверены, что хотите удалить выпуск "${issue?.name || 'Без названия'}" из архива? PDF файл будет удалён безвозвратно.`,
      confirmText: 'Удалить',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await removeFromArchive(issueId);
          actions.removeFromArchive(issueId);
          showSuccess('Выпуск удалён из архива');
        } catch (error) {
          console.error('Error deleting from archive:', error);
          showError('Ошибка при удалении из архива');
        }
      }
    });
  };

  // Review handler
  const handleReviewArticle = async (content, fileName) => {
    setProcessing(true, 'Генерация рецензии...');
    try {
      const review = await reviewArticle(content, fileName);
      actions.setReviewResult(review);
      showSuccess('Рецензия готова');
    } catch (error) {
      console.error('Review error:', error);

      // Handle limit exceeded errors - show big banner
      if (error.message?.includes('REVIEW_LIMIT') ||
          error.message?.includes('ALL_PROVIDERS_EXHAUSTED') ||
          error.message?.includes('RATE_LIMIT')) {
        const parts = error.message.split('|');
        const message = parts[1] || 'Лимит AI исчерпан. Попробуйте позже.';
        showLimitExhausted(message);
      } else {
        showError('Ошибка при создании рецензии: ' + error.message);
      }
    } finally {
      setProcessing(false);
    }
  };

  // Spell check handler
  const handleSpellCheck = async (content, fileName) => {
    setProcessing(true, 'Проверка орфографии...');
    try {
      const result = await checkSpelling(content, fileName);
      actions.addSpellCheckResults([result]);
      if (result.totalErrors === 0) {
        showSuccess(`Проверка завершена: ошибок не найдено в "${fileName}"`);
      } else {
        showSuccess(`Проверка завершена: найдено ${result.totalErrors} ошибок в "${fileName}"`);
      }
    } catch (error) {
      console.error('Spell check error:', error);

      // Handle limit exceeded errors - show big banner
      if (error.message?.includes('SPELL_CHECK_LIMIT') ||
          error.message?.includes('ALL_PROVIDERS_EXHAUSTED') ||
          error.message?.includes('RATE_LIMIT')) {
        const parts = error.message.split('|');
        const message = parts[1] || 'Лимит AI исчерпан. Попробуйте позже.';
        showLimitExhausted(message);
      } else {
        showError('Ошибка при проверке орфографии: ' + error.message);
      }
    } finally {
      setProcessing(false);
    }
  };

  // Retry classification for a single article
  const handleRetryClassification = async (articleId) => {
    const article = articles.find(a => a.id === articleId);
    if (!article) {
      showError('Статья не найдена');
      return;
    }

    setRetryingArticleId(articleId);

    try {
      const classification = await retryArticleClassification(
        article.content,
        article.title,
        3 // 3 retry attempts
      );

      // Update the article with new classification
      const updates = {
        section: classification.section,
        sectionConfidence: classification.confidence,
        needsReview: classification.needsReview,
        sectionReasoning: classification.reasoning,
        retryAttempted: true,
        retryTimestamp: new Date().toISOString()
      };

      actions.updateArticle(articleId, updates);

      // Re-sort articles
      const updated = articles.map((a) =>
        a.id === articleId ? { ...a, ...updates } : a
      );
      actions.setArticles(sortArticlesBySectionAndLanguage(updated));

      if (classification.section !== NEEDS_REVIEW_SECTION) {
        showSuccess(`Статья классифицирована: ${classification.section}`);
      } else {
        showError('Не удалось классифицировать статью. Выберите раздел вручную.');
      }
    } catch (error) {
      console.error('Retry classification error:', error);
      showError('Ошибка при повторной классификации: ' + error.message);
    } finally {
      setRetryingArticleId(null);
    }
  };

  // Retry classification for all unclassified articles
  const handleRetryAllClassification = async () => {
    const unclassifiedArticles = articles.filter(
      a => (a.needsReview || a.section === NEEDS_REVIEW_SECTION) && !a.manuallyClassified
    );

    if (unclassifiedArticles.length === 0) {
      showSuccess('Все статьи уже классифицированы');
      return;
    }

    setRetryingArticleId('all');
    setProcessing(true, `Повторный анализ: 0/${unclassifiedArticles.length}...`);

    try {
      const results = await batchRetryClassification(
        unclassifiedArticles,
        (current, total, article) => {
          setProcessing(true, `Повторный анализ: ${current}/${total} - ${article.title.substring(0, 30)}...`);
        }
      );

      // Update all articles with new classification results
      const updatedArticles = articles.map(article => {
        const result = results.find(r => r.id === article.id);
        if (result) {
          return result;
        }
        return article;
      });

      actions.setArticles(sortArticlesBySectionAndLanguage(updatedArticles));

      // Calculate statistics
      const successCount = results.filter(r => r.section !== NEEDS_REVIEW_SECTION).length;
      const failedCount = results.length - successCount;

      if (successCount > 0 && failedCount === 0) {
        showSuccess(`Успешно классифицировано ${successCount} статей`);
      } else if (successCount > 0) {
        showSuccess(`Классифицировано ${successCount} статей, ${failedCount} требуют ручной классификации`);
      } else {
        showError(`Не удалось классифицировать ${failedCount} статей. Выберите разделы вручную.`);
      }
    } catch (error) {
      console.error('Batch retry classification error:', error);
      showError('Ошибка при массовой классификации: ' + error.message);
    } finally {
      setRetryingArticleId(null);
      setProcessing(false);
    }
  };

  // Handle onboarding complete
  const handleOnboardingComplete = () => {
    actions.setOnboardingSeen();
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden transition-colors">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-primary/20 blur-[120px] neural-pulse" />
        <div className="absolute top-1/3 -left-40 w-[500px] h-[500px] rounded-full bg-accent/15 blur-[100px] neural-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/10 blur-[90px] neural-pulse" style={{ animationDelay: '2s' }} />
      </div>
      <div className="container mx-auto p-6 max-w-7xl relative z-10">
        <Header articlesCount={articles.length} isDark={isDark} onThemeToggle={toggleTheme} />
        <Tabs activeTab={activeTab} setActiveTab={actions.setActiveTab} />

        {activeTab === 'editor' && (
          <EditorTab
            articles={articles}
            coverPage={coverPage}
            descriptionPage={descriptionPage}
            finalPage={finalPage}
            editingArticle={editingArticle}
            isProcessing={isProcessing}
            onCoverUpload={(file) => handleSpecialPageUpload(file, 'cover')}
            onDescriptionUpload={(file) => handleSpecialPageUpload(file, 'description')}
            onFinalUpload={(file) => handleSpecialPageUpload(file, 'final')}
            onArticlesUpload={handleArticlesUpload}
            onEditArticle={actions.setEditingArticle}
            onUpdateArticle={updateArticle}
            onDeleteArticle={deleteArticle}
            onStopEditing={() => actions.setEditingArticle(null)}
            onGeneratePDF={handleGeneratePDF}
            onRetryClassification={handleRetryClassification}
            onRetryAllClassification={handleRetryAllClassification}
            retryingArticleId={retryingArticleId}
            fileInputRef={fileInputRef}
            coverInputRef={coverInputRef}
            descInputRef={descInputRef}
            finalInputRef={finalInputRef}
          />
        )}

        {activeTab === 'spellcheck' && (
          <SpellCheckTab
            articles={articles}
            spellCheckResults={spellCheckResults}
            onSpellCheck={handleSpellCheck}
          />
        )}

        {activeTab === 'review' && (
          <ReviewTab
            articles={articles}
            reviewResult={reviewResult}
            onReviewArticle={handleReviewArticle}
          />
        )}

        {activeTab === 'archive' && (
          <ArchiveTab
            archive={archive}
            onDownload={handleDownloadFromArchive}
            onView={handleViewFromArchive}
            onDelete={handleDeleteFromArchive}
          />
        )}

        {activeTab === 'info' && <InfoTab />}

        {isProcessing && (
          <LoadingOverlay
            message={processingMessage}
            current={progressCurrent}
            total={progressTotal}
          />
        )}
      </div>

      {/* Toast notifications */}
      <ToastContainer
        notifications={notifications}
        removeNotification={removeNotification}
      />

      {/* Onboarding for new users */}
      {!hasSeenOnboarding && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={hideConfirm}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
      />

      {/* Limit Exhausted Banner */}
      <LimitExhaustedBanner
        isVisible={limitExhausted.isVisible}
        onDismiss={hideLimitExhausted}
        message={limitExhausted.message}
      />
    </div>
  );
};

export default App;
