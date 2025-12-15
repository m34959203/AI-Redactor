import React, { useState, useRef } from 'react';
import Header from './components/UI/Header';
import Tabs from './components/UI/Tabs';
import LoadingOverlay from './components/UI/LoadingOverlay';
import EditorTab from './components/Editor/EditorTab';
import SpellCheckTab from './components/SpellCheck/SpellCheckTab';
import ReviewTab from './components/Review/ReviewTab';
import ArchiveTab from './components/Archive/ArchiveTab';

import { extractMetadataWithAI, checkSpelling, reviewArticle } from './services/claudeApi';
import { validatePageFile, validateArticleFile } from './utils/fileValidation';
import { detectLanguage, sortArticlesByLanguage } from './utils/languageDetection';
import { validatePdfRequirements, createIssue, generatePDF as generatePDFUtil } from './utils/pdfGenerator';

const App = () => {
  // State
  const [articles, setArticles] = useState([]);
  const [coverPage, setCoverPage] = useState(null);
  const [descriptionPage, setDescriptionPage] = useState(null);
  const [finalPage, setFinalPage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const [archive, setArchive] = useState([]);
  const [editingArticle, setEditingArticle] = useState(null);
  const [spellCheckResults, setSpellCheckResults] = useState([]);
  const [reviewResult, setReviewResult] = useState(null);

  // Refs
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const descInputRef = useRef(null);
  const finalInputRef = useRef(null);

  // Special page upload handlers
  const handleSpecialPageUpload = async (file, type) => {
    if (!file) {
      // Handle deletion
      switch (type) {
        case 'cover':
          setCoverPage(null);
          break;
        case 'description':
          setDescriptionPage(null);
          break;
        case 'final':
          setFinalPage(null);
          break;
      }
      return;
    }

    const validation = validatePageFile(file);
    if (!validation.valid) {
      alert(validation.error);
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
        setCoverPage(pageData);
        break;
      case 'description':
        setDescriptionPage(pageData);
        break;
      case 'final':
        setFinalPage(pageData);
        break;
    }
  };

  // Articles upload handler
  const handleArticlesUpload = async (files) => {
    setIsProcessing(true);
    const newArticles = [];
    const spellChecks = [];

    try {
      for (const file of files) {
        const validation = validateArticleFile(file);
        if (!validation.valid) {
          console.warn(`Skipping file ${file.name}: ${validation.error}`);
          continue;
        }

        const content = await file.text();
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

        // Spell check
        const spellCheck = await checkSpelling(content, file.name);
        spellChecks.push(spellCheck);
      }

      const allArticles = [...articles, ...newArticles];
      const sortedArticles = sortArticlesByLanguage(allArticles);

      setArticles(sortedArticles);
      setSpellCheckResults((prev) => [...prev, ...spellChecks]);
    } catch (error) {
      console.error('Error uploading articles:', error);
      alert('Ошибка при загрузке статей: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Article management
  const updateArticle = (id, field, value) => {
    setArticles((prev) => {
      const updated = prev.map((a) => {
        if (a.id === id) {
          const updatedArticle = { ...a, [field]: value };
          if (field === 'author') {
            updatedArticle.language = detectLanguage(value);
          }
          return updatedArticle;
        }
        return a;
      });

      // Re-sort if author changed
      if (field === 'author') {
        return sortArticlesByLanguage(updated);
      }
      return updated;
    });
  };

  const deleteArticle = (id) => {
    setArticles((prev) => prev.filter((a) => a.id !== id));
  };

  // PDF Generation
  const handleGeneratePDF = async () => {
    const validation = validatePdfRequirements(coverPage, descriptionPage, finalPage);

    if (!validation.valid) {
      alert('Загрузите все необходимые страницы:\n' + validation.missingPages.join('\n'));
      return;
    }

    if (articles.length === 0) {
      alert('Загрузите хотя бы одну статью');
      return;
    }

    setIsProcessing(true);

    try {
      const issue = createIssue(articles, coverPage, descriptionPage, finalPage);
      await generatePDFUtil(issue);

      setArchive((prev) => [...prev, issue]);
      alert(
        `PDF успешно сгенерирован!\n\nСтруктура выпуска:\n1. Титульный лист\n2. Описание журнала\n3. ${articles.length} статей\n4. Содержание\n5. Заключительная страница`
      );
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Ошибка при генерации PDF');
    } finally {
      setIsProcessing(false);
    }
  };

  // Review handler
  const handleReviewArticle = async (content, fileName) => {
    setIsProcessing(true);
    try {
      const review = await reviewArticle(content, fileName);
      setReviewResult(review);
    } catch (error) {
      console.error('Review error:', error);
      alert('Ошибка при создании рецензии');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto p-6 max-w-7xl">
        <Header articlesCount={articles.length} />
        <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />

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
            onEditArticle={setEditingArticle}
            onUpdateArticle={updateArticle}
            onDeleteArticle={deleteArticle}
            onStopEditing={() => setEditingArticle(null)}
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

        {activeTab === 'archive' && <ArchiveTab archive={archive} />}

        {isProcessing && <LoadingOverlay />}
      </div>
    </div>
  );
};

export default App;
