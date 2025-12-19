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

import { useApp, useNotifications, useProcessing } from './context/AppContext';
import { extractMetadataWithAI, checkSpelling, reviewArticle } from './services/aiApi';
import { validatePageFile, validateArticleFile } from './utils/fileValidation';
import { detectLanguage, sortArticlesByLanguage } from './utils/languageDetection';
import { validatePdfRequirements, createIssue, generatePDF, downloadPDF } from './utils/pdfGenerator';
import { convertDocxToText } from './utils/docxConverter';
import { addToArchive, getPdfBlob, removeFromArchive } from './utils/archiveStorage';

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

  // Articles upload handler
  const handleArticlesUpload = async (files) => {
    const totalFiles = files.length;
    setProcessing(true, 'Загрузка статей...', 0, totalFiles);
    const newArticles = [];
    const spellChecks = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const currentFile = i + 1;

        setProcessing(true, `Чтение: ${file.name}`, currentFile, totalFiles);

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

        setProcessing(true, `AI анализ: ${file.name}`, currentFile, totalFiles);
        const metadata = await extractMetadataWithAI(file.name, content);
        const language = detectLanguage(metadata.author);

        const article = {
          id: Date.now() + Math.random(),
          file,
          title: metadata.title,
          author: metadata.author,
          language,
          content,
        };

        newArticles.push(article);

        setProcessing(true, `Орфография: ${file.name}`, currentFile, totalFiles);
        const spellCheck = await checkSpelling(content, file.name);
        spellChecks.push(spellCheck);
      }

      const allArticles = [...articles, ...newArticles];
      const sortedArticles = sortArticlesByLanguage(allArticles);

      actions.setArticles(sortedArticles);
      actions.addSpellCheckResults(spellChecks);

      showSuccess(`Загружено ${newArticles.length} статей`);
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
    if (field === 'author') {
      updates.language = detectLanguage(value);
    }
    actions.updateArticle(id, updates);

    // Re-sort if author changed
    if (field === 'author') {
      const updated = articles.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      );
      actions.setArticles(sortArticlesByLanguage(updated));
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

      const pdfBlob = await generatePDF(
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
