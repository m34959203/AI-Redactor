import React, { useRef, useEffect, useState } from 'react';
import Header from './components/UI/Header';
import Tabs from './components/UI/Tabs';
import LoadingOverlay from './components/UI/LoadingOverlay';
import ToastContainer from './components/UI/Toast';
import Onboarding from './components/UI/Onboarding';
import EditorTab from './components/Editor/EditorTab';
import SpellCheckTab from './components/SpellCheck/SpellCheckTab';
import ReviewTab from './components/Review/ReviewTab';
import ArchiveTab from './components/Archive/ArchiveTab';
import InfoTab from './components/Info/InfoTab';

import { useApp, useNotifications, useProcessing } from './context/AppContext';
import { extractMetadataWithAI, checkSpelling, reviewArticle, detectArticleSection, ARTICLE_SECTIONS, retryArticleClassification, batchRetryClassification } from './services/aiApi';
import { validatePageFile, validateArticleFile } from './utils/fileValidation';
import { detectLanguage, sortArticlesBySectionAndLanguage, NEEDS_REVIEW_SECTION } from './utils/languageDetection';
import { CONFIDENCE_THRESHOLDS } from './constants/sections';
import { validatePdfRequirements, createIssue, generatePDF, generatePDFSmart, downloadPDF } from './utils/pdfGenerator';
import { convertDocxToText } from './utils/docxConverter';
import { addToArchive, getPdfBlob, removeFromArchive } from './utils/archiveStorage';
import { extractMetadataLocal } from './utils/localMetadataParser';

const App = () => {
  const { state, actions } = useApp();
  const { notifications, showSuccess, showError, removeNotification } = useNotifications();
  const { isProcessing, processingMessage, progressCurrent, progressTotal, setProcessing } = useProcessing();

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

  // Articles upload handler - fast local processing with optional AI enhancement
  const handleArticlesUpload = async (files) => {
    const totalFiles = files.length;
    // 2 steps per file: read + local parse, then optional AI
    const totalSteps = totalFiles * 2;
    let currentStep = 0;
    setProcessing(true, 'Загрузка статей...', currentStep, totalSteps);
    const newArticles = [];
    let aiAvailable = true; // Track if AI is working

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileNum = i + 1;

        setProcessing(true, `[${fileNum}/${totalFiles}] Чтение: ${file.name}`, currentStep, totalSteps);

        const validation = validateArticleFile(file);
        if (!validation.valid) {
          console.warn(`Skipping file ${file.name}: ${validation.error}`);
          currentStep += 2;
          continue;
        }

        // Step 1: Read file content
        let content;
        try {
          content = await convertDocxToText(file);
        } catch (error) {
          console.error('Error extracting text:', error);
          content = await file.text();
        }

        // Step 2: Local metadata extraction (always works, fast)
        const localMetadata = extractMetadataLocal(file.name, content);
        let metadata = localMetadata;
        let sectionResult = {
          section: NEEDS_REVIEW_SECTION,
          confidence: 0,
          needsReview: true,
          reasoning: 'Требуется классификация'
        };

        currentStep++;

        // Step 3: Try AI enhancement only if still available
        if (aiAvailable) {
          setProcessing(true, `[${fileNum}/${totalFiles}] AI анализ: ${file.name}`, currentStep, totalSteps);

          try {
            // Try AI metadata extraction
            const aiMetadata = await extractMetadataWithAI(file.name, content);
            // Use AI metadata if it looks valid
            if (aiMetadata.title && aiMetadata.title !== file.name.replace('.docx', '').replace(/_/g, ' ')) {
              metadata = aiMetadata;
            }

            // Try AI section detection
            const aiSection = await detectArticleSection(content, metadata.title);
            if (aiSection.section !== NEEDS_REVIEW_SECTION) {
              sectionResult = aiSection;
            }
          } catch (error) {
            // Check if it's a rate limit error
            if (error.message?.includes('Rate limit') || error.message?.includes('429')) {
              console.warn('AI rate limited, switching to local-only mode for remaining files');
              aiAvailable = false;
            } else {
              console.warn('AI error, using local metadata:', error.message);
            }
          }
        }

        currentStep++;

        // Determine language from title (priority) or content
        const language = detectLanguage(metadata.title) || detectLanguage(content.substring(0, 500)) || 'cyrillic';

        const article = {
          id: Date.now() + Math.random(),
          file,
          title: metadata.title,
          author: metadata.author,
          language,
          section: sectionResult.section,
          sectionConfidence: sectionResult.confidence,
          needsReview: sectionResult.needsReview,
          sectionReasoning: sectionResult.reasoning,
          content,
          aiProcessed: aiAvailable, // Track if AI was used
        };

        newArticles.push(article);
      }

      const allArticles = [...articles, ...newArticles];
      const sortedArticles = sortArticlesBySectionAndLanguage(allArticles);

      actions.setArticles(sortedArticles);

      // Show appropriate message based on AI availability
      const needsClassification = newArticles.filter(a => a.needsReview).length;
      if (needsClassification > 0) {
        showSuccess(`Загружено ${newArticles.length} статей. ${needsClassification} требуют классификации (нажмите "Повторить анализ")`);
      } else {
        showSuccess(`Загружено ${newArticles.length} статей`);
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
    // Пересчитываем язык при изменении названия (приоритет) или автора (fallback)
    if (field === 'title') {
      const article = articles.find(a => a.id === id);
      updates.language = detectLanguage(value) || detectLanguage(article?.content?.substring(0, 500)) || 'cyrillic';
    }
    if (field === 'author') {
      // Если язык ещё не определён по названию - пробуем по автору
      const article = articles.find(a => a.id === id);
      const currentLang = detectLanguage(article?.title);
      if (!currentLang || currentLang === 'latin') {
        updates.language = detectLanguage(value) || detectLanguage(article?.content?.substring(0, 500)) || 'cyrillic';
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
    actions.deleteArticle(id);
    showSuccess('Статья удалена');
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
    try {
      await removeFromArchive(issueId);
      actions.removeFromArchive(issueId);
      showSuccess('Выпуск удалён из архива');
    } catch (error) {
      console.error('Error deleting from archive:', error);
      showError('Ошибка при удалении из архива');
    }
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
      showError('Ошибка при создании рецензии');
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto p-6 max-w-7xl">
        <Header articlesCount={articles.length} />
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
          <SpellCheckTab spellCheckResults={spellCheckResults} />
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
    </div>
  );
};

export default App;
