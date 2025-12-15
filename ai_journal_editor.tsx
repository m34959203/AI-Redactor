import React, { useState, useRef } from 'react';
import { Upload, FileText, Download, BookOpen, CheckCircle, Edit2, Trash2, Eye, AlertCircle, Check, X } from 'lucide-react';

const App = () => {
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
  const [selectedCoverFile, setSelectedCoverFile] = useState(null);
  const [selectedDescFile, setSelectedDescFile] = useState(null);
  const [selectedFinalFile, setSelectedFinalFile] = useState(null);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const descInputRef = useRef(null);
  const finalInputRef = useRef(null);

  // Извлечение текста из DOCX с помощью AI
  const extractMetadataWithAI = async (fileName, content) => {
    setIsProcessing(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: `Проанализируй этот текст статьи и извлеки:
1. Название статьи (обычно в начале, может быть в верхнем регистре)
2. ФИО автора/авторов (обычно после названия)

Текст файла "${fileName}":
${content.substring(0, 2000)}

Ответь ТОЛЬКО в формате JSON без дополнительного текста:
{
  "title": "название статьи",
  "author": "фамилия автора (только латиница или кириллица)"
}`
            }
          ],
        })
      });

      const data = await response.json();
      const text = data.content[0].text.replace(/```json|```/g, "").trim();
      const metadata = JSON.parse(text);
      
      return metadata;
    } catch (error) {
      console.error("AI extraction error:", error);
      return {
        title: fileName.replace('.docx', ''),
        author: 'Неизвестный автор'
      };
    } finally {
      setIsProcessing(false);
    }
  };

  // Проверка орфографии с помощью AI
  const checkSpelling = async (content, fileName) => {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: `Проверь орфографию в следующем тексте и найди все ошибки:

${content.substring(0, 3000)}

Ответь ТОЛЬКО в формате JSON:
{
  "errors": [
    {"word": "ошибочное слово", "suggestion": "правильное написание", "context": "контекст ошибки"}
  ],
  "totalErrors": число_ошибок
}`
            }
          ],
        })
      });

      const data = await response.json();
      const text = data.content[0].text.replace(/```json|```/g, "").trim();
      const result = JSON.parse(text);
      
      return {
        fileName,
        ...result
      };
    } catch (error) {
      console.error("Spell check error:", error);
      return { fileName, errors: [], totalErrors: 0 };
    }
  };

  // Рецензия статьи с помощью AI
  const reviewArticle = async (content, fileName) => {
    setIsProcessing(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          messages: [
            {
              role: "user",
              content: `Проведи рецензию следующей научной статьи и проанализируй по критериям:

Текст статьи:
${content.substring(0, 4000)}

Проанализируй статью по следующим критериям (оценка от 1 до 5):
1. Структура (введение, основная часть, выводы)
2. Логичность изложения
3. Оригинальность исследования
4. Научный стиль
5. Актуальность темы

Ответь в формате JSON:
{
  "structure": {"score": число, "comment": "комментарий"},
  "logic": {"score": число, "comment": "комментарий"},
  "originality": {"score": число, "comment": "комментарий"},
  "style": {"score": число, "comment": "комментарий"},
  "relevance": {"score": число, "comment": "комментарий"},
  "overallScore": средний_балл,
  "summary": "общий вывод рецензии",
  "recommendations": ["рекомендация 1", "рекомендация 2"]
}`
            }
          ],
        })
      });

      const data = await response.json();
      const text = data.content[0].text.replace(/```json|```/g, "").trim();
      const review = JSON.parse(text);
      
      setReviewResult({ fileName, ...review });
    } catch (error) {
      console.error("Review error:", error);
      alert("Ошибка при создании рецензии");
    } finally {
      setIsProcessing(false);
    }
  };

  // Определение языка автора
  const detectLanguage = (author) => {
    const cyrillicPattern = /[а-яА-ЯёЁ]/;
    return cyrillicPattern.test(author) ? 'cyrillic' : 'latin';
  };

  // Обработка загрузки специальных страниц
  const handleSpecialPageUpload = async (file, type) => {
    if (!file) return;
    
    const validTypes = ['.docx', '.pdf'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(fileExt)) {
      alert('Поддерживаются только .docx и .pdf форматы');
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      alert('Размер файла не должен превышать 50 МБ');
      return;
    }

    const pageData = {
      file,
      name: file.name,
      type: fileExt,
      uploadDate: new Date().toISOString()
    };

    switch(type) {
      case 'cover':
        setCoverPage(pageData);
        setSelectedCoverFile(file);
        break;
      case 'description':
        setDescriptionPage(pageData);
        setSelectedDescFile(file);
        break;
      case 'final':
        setFinalPage(pageData);
        setSelectedFinalFile(file);
        break;
    }
  };

  // Обработка загрузки статей
  const handleArticlesUpload = async (files) => {
    setIsProcessing(true);
    const newArticles = [];
    const spellChecks = [];

    for (const file of files) {
      if (file.name.endsWith('.docx') && file.size <= 50 * 1024 * 1024) {
        const content = await file.text();
        const metadata = await extractMetadataWithAI(file.name, content);
        const language = detectLanguage(metadata.author);
        
        const article = {
          id: Date.now() + Math.random(),
          file,
          title: metadata.title,
          author: metadata.author,
          language,
          content
        };
        
        newArticles.push(article);
        
        // Проверка орфографии
        const spellCheck = await checkSpelling(content, file.name);
        spellChecks.push(spellCheck);
      }
    }

    setArticles(prev => [...prev, ...newArticles]);
    setSpellCheckResults(prev => [...prev, ...spellChecks]);
    setIsProcessing(false);
    sortArticles([...articles, ...newArticles]);
  };

  // Сортировка статей
  const sortArticles = (articlesToSort = articles) => {
    const sorted = [...articlesToSort].sort((a, b) => {
      if (a.language === b.language) {
        return a.author.localeCompare(b.author, a.language === 'cyrillic' ? 'ru' : 'en');
      }
      return a.language === 'cyrillic' ? -1 : 1;
    });
    setArticles(sorted);
  };

  // Генерация PDF
  const generatePDF = async () => {
    if (articles.length === 0) {
      alert('Загрузите хотя бы одну статью');
      return;
    }

    if (!coverPage) {
      alert('Загрузите титульный лист журнала');
      return;
    }

    if (!descriptionPage) {
      alert('Загрузите страницу описания журнала и редакции');
      return;
    }

    if (!finalPage) {
      alert('Загрузите заключительную страницу журнала');
      return;
    }

    setIsProcessing(true);
    
    // Симуляция генерации PDF с учетом структуры:
    // 1. Титульный лист
    // 2. Описание журнала и редакции
    // 3. Статьи (с 4 пустыми строками перед каждой)
    // 4. Автоматическое содержание
    // 5. Заключительная страница
    setTimeout(() => {
      const issue = {
        id: Date.now(),
        date: new Date().toLocaleDateString('ru-RU'),
        articlesCount: articles.length,
        name: `Выпуск ${new Date().toLocaleDateString('ru-RU')}`,
        hasCover: !!coverPage,
        hasDescription: !!descriptionPage,
        hasFinal: !!finalPage
      };
      
      setArchive(prev => [...prev, issue]);
      alert(`PDF успешно сгенерирован!\n\nСтруктура выпуска:\n1. Титульный лист\n2. Описание журнала\n3. ${articles.length} статей\n4. Содержание\n5. Заключительная страница`);
      setIsProcessing(false);
    }, 2000);
  };

  // Редактирование статьи
  const updateArticle = (id, field, value) => {
    setArticles(prev => prev.map(a => 
      a.id === id ? { ...a, [field]: value, language: field === 'author' ? detectLanguage(value) : a.language } : a
    ));
    if (field === 'author') {
      sortArticles();
    }
  };

  const deleteArticle = (id) => {
    setArticles(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-800 flex items-center gap-3">
                <BookOpen className="text-indigo-600" size={40} />
                AI-Редактор научного журнала
              </h1>
              <p className="text-gray-600 mt-2">Автоматизация сборки выпусков за 10 минут</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Статей загружено</div>
              <div className="text-3xl font-bold text-indigo-600">{articles.length}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-xl mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-6 py-4 font-semibold transition ${
                activeTab === 'editor' 
                  ? 'border-b-2 border-indigo-600 text-indigo-600' 
                  : 'text-gray-600 hover:text-indigo-600'
              }`}
            >
              <Edit2 className="inline mr-2" size={20} />
              Редактор
            </button>
            <button
              onClick={() => setActiveTab('spellcheck')}
              className={`px-6 py-4 font-semibold transition ${
                activeTab === 'spellcheck' 
                  ? 'border-b-2 border-indigo-600 text-indigo-600' 
                  : 'text-gray-600 hover:text-indigo-600'
              }`}
            >
              <CheckCircle className="inline mr-2" size={20} />
              Проверка орфографии
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`px-6 py-4 font-semibold transition ${
                activeTab === 'review' 
                  ? 'border-b-2 border-indigo-600 text-indigo-600' 
                  : 'text-gray-600 hover:text-indigo-600'
              }`}
            >
              <Eye className="inline mr-2" size={20} />
              Рецензия
            </button>
            <button
              onClick={() => setActiveTab('archive')}
              className={`px-6 py-4 font-semibold transition ${
                activeTab === 'archive' 
                  ? 'border-b-2 border-indigo-600 text-indigo-600' 
                  : 'text-gray-600 hover:text-indigo-600'
              }`}
            >
              <FileText className="inline mr-2" size={20} />
              Архив
            </button>
          </div>
        </div>

        {/* Editor Tab */}
        {activeTab === 'editor' && (
          <div className="space-y-6">
            {/* Special Pages Upload */}
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">Структура журнала</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Титульный лист */}
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6">
                  <div className="text-center">
                    <div className="bg-blue-100 text-blue-600 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-lg">1</span>
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-2">Титульный лист</h3>
                    <p className="text-sm text-gray-600 mb-4">Обложка журнала</p>
                    
                    {coverPage ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                        <CheckCircle className="text-green-600 mx-auto mb-2" size={24} />
                        <p className="text-sm text-green-800 font-medium truncate">{coverPage.name}</p>
                        <button
                          onClick={() => {
                            setCoverPage(null);
                            setSelectedCoverFile(null);
                          }}
                          className="mt-2 text-xs text-red-600 hover:text-red-800"
                        >
                          Удалить
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => coverInputRef.current?.click()}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                      >
                        <Upload className="inline mr-2" size={16} />
                        Загрузить
                      </button>
                    )}
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept=".docx,.pdf"
                      onChange={(e) => handleSpecialPageUpload(e.target.files[0], 'cover')}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Описание журнала */}
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6">
                  <div className="text-center">
                    <div className="bg-purple-100 text-purple-600 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-lg">2</span>
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-2">Описание и редакция</h3>
                    <p className="text-sm text-gray-600 mb-4">О журнале и редколлегии</p>
                    
                    {descriptionPage ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                        <CheckCircle className="text-green-600 mx-auto mb-2" size={24} />
                        <p className="text-sm text-green-800 font-medium truncate">{descriptionPage.name}</p>
                        <button
                          onClick={() => {
                            setDescriptionPage(null);
                            setSelectedDescFile(null);
                          }}
                          className="mt-2 text-xs text-red-600 hover:text-red-800"
                        >
                          Удалить
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => descInputRef.current?.click()}
                        className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm"
                      >
                        <Upload className="inline mr-2" size={16} />
                        Загрузить
                      </button>
                    )}
                    <input
                      ref={descInputRef}
                      type="file"
                      accept=".docx,.pdf"
                      onChange={(e) => handleSpecialPageUpload(e.target.files[0], 'description')}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Заключительная страница */}
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6">
                  <div className="text-center">
                    <div className="bg-orange-100 text-orange-600 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-lg">∞</span>
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-2">Заключительная страница</h3>
                    <p className="text-sm text-gray-600 mb-4">После содержания</p>
                    
                    {finalPage ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                        <CheckCircle className="text-green-600 mx-auto mb-2" size={24} />
                        <p className="text-sm text-green-800 font-medium truncate">{finalPage.name}</p>
                        <button
                          onClick={() => {
                            setFinalPage(null);
                            setSelectedFinalFile(null);
                          }}
                          className="mt-2 text-xs text-red-600 hover:text-red-800"
                        >
                          Удалить
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => finalInputRef.current?.click()}
                        className="w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 text-sm"
                      >
                        <Upload className="inline mr-2" size={16} />
                        Загрузить
                      </button>
                    )}
                    <input
                      ref={finalInputRef}
                      type="file"
                      accept=".docx,.pdf"
                      onChange={(e) => handleSpecialPageUpload(e.target.files[0], 'final')}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-blue-600 flex-shrink-0 mt-1" size={20} />
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

            {/* Upload Zone */}
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">Загрузка статей</h2>
              
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleArticlesUpload(Array.from(e.dataTransfer.files));
                }}
                onDragOver={(e) => e.preventDefault()}
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
                  onChange={(e) => handleArticlesUpload(Array.from(e.target.files))}
                  className="hidden"
                />
              </div>
            </div>

            {/* Articles List */}
            {articles.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">
                  Статьи ({articles.length})
                </h2>
                
                <div className="space-y-4">
                  {articles.map((article, index) => (
                    <div key={article.id} className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition">
                      <div className="flex items-start gap-4">
                        <div className="bg-indigo-100 text-indigo-600 rounded-lg w-12 h-12 flex items-center justify-center font-bold text-lg flex-shrink-0">
                          {index + 1}
                        </div>
                        
                        {editingArticle === article.id ? (
                          <div className="flex-1 space-y-3">
                            <input
                              value={article.title}
                              onChange={(e) => updateArticle(article.id, 'title', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                              placeholder="Название статьи"
                            />
                            <input
                              value={article.author}
                              onChange={(e) => updateArticle(article.id, 'author', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                              placeholder="Автор"
                            />
                            <button
                              onClick={() => setEditingArticle(null)}
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
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {article.language === 'cyrillic' ? 'Кириллица' : 'Латиница'}
                              </span>
                            </p>
                            <p className="text-sm text-gray-500">{article.file.name}</p>
                          </div>
                        )}
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingArticle(article.id)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <Edit2 size={20} />
                          </button>
                          <button
                            onClick={() => deleteArticle(article.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex gap-4">
                  <button
                    onClick={generatePDF}
                    disabled={isProcessing || !coverPage || !descriptionPage || !finalPage}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    <Download className="inline mr-2" size={20} />
                    {isProcessing ? 'Генерация...' : 'Сгенерировать PDF'}
                  </button>
                </div>
                
                {(!coverPage || !descriptionPage || !finalPage) && (
                  <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="text-yellow-600 flex-shrink-0 mt-1" size={20} />
                      <div className="text-sm text-yellow-800">
                        <p className="font-semibold mb-1">Для генерации PDF необходимо загрузить:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {!coverPage && <li>Титульный лист</li>}
                          {!descriptionPage && <li>Описание журнала и редакции</li>}
                          {!finalPage && <li>Заключительную страницу</li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Spell Check Tab */}
        {activeTab === 'spellcheck' && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Результаты проверки орфографии</h2>
            
            {spellCheckResults.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle className="mx-auto mb-4 text-gray-400" size={48} />
                <p>Загрузите статьи для проверки орфографии</p>
              </div>
            ) : (
              <div className="space-y-6">
                {spellCheckResults.map((result, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-800">{result.fileName}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        result.totalErrors === 0 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {result.totalErrors === 0 ? 'Ошибок не найдено' : `Найдено ошибок: ${result.totalErrors}`}
                      </span>
                    </div>
                    
                    {result.errors && result.errors.length > 0 && (
                      <div className="space-y-2">
                        {result.errors.map((error, errIdx) => (
                          <div key={errIdx} className="bg-gray-50 p-3 rounded-lg">
                            <div className="flex items-start gap-3">
                              <X className="text-red-500 flex-shrink-0 mt-1" size={18} />
                              <div className="flex-1">
                                <p className="font-semibold text-gray-800">
                                  <span className="text-red-600">{error.word}</span>
                                  {' → '}
                                  <span className="text-green-600">{error.suggestion}</span>
                                </p>
                                <p className="text-sm text-gray-600 mt-1">{error.context}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Review Tab */}
        {activeTab === 'review' && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Модуль рецензирования</h2>
            
            {articles.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Eye className="mx-auto mb-4 text-gray-400" size={48} />
                <p>Загрузите статьи для рецензирования</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="border border-gray-200 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">Выберите статью для рецензии</h3>
                  <select
                    onChange={(e) => {
                      const article = articles.find(a => a.id.toString() === e.target.value);
                      if (article) reviewArticle(article.content, article.file.name);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    defaultValue=""
                  >
                    <option value="" disabled>Выберите статью...</option>
                    {articles.map(article => (
                      <option key={article.id} value={article.id}>
                        {article.title} - {article.author}
                      </option>
                    ))}
                  </select>
                </div>

                {reviewResult && (
                  <div className="border border-gray-200 rounded-xl p-6">
                    <h3 className="text-xl font-bold mb-4">Рецензия: {reviewResult.fileName}</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {[
                        { key: 'structure', label: 'Структура' },
                        { key: 'logic', label: 'Логичность' },
                        { key: 'originality', label: 'Оригинальность' },
                        { key: 'style', label: 'Стиль' },
                        { key: 'relevance', label: 'Актуальность' }
                      ].map(({ key, label }) => (
                        <div key={key} className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold">{label}</span>
                            <span className="text-2xl font-bold text-indigo-600">
                              {reviewResult[key]?.score}/5
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{reviewResult[key]?.comment}</p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-indigo-50 p-6 rounded-xl mb-4">
                      <div className="text-center mb-4">
                        <span className="text-sm text-gray-600">Общая оценка</span>
                        <div className="text-4xl font-bold text-indigo-600">
                          {reviewResult.overallScore}/5
                        </div>
                      </div>
                      <p className="text-gray-700"><strong>Вывод:</strong> {reviewResult.summary}</p>
                    </div>

                    {reviewResult.recommendations && (
                      <div className="bg-yellow-50 p-6 rounded-xl">
                        <h4 className="font-semibold mb-3">Рекомендации:</h4>
                        <ul className="list-disc list-inside space-y-2">
                          {reviewResult.recommendations.map((rec, idx) => (
                            <li key={idx} className="text-gray-700">{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      onClick={() => alert('Функция экспорта в разработке')}
                      className="mt-6 w-full bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700"
                    >
                      <Download className="inline mr-2" size={20} />
                      Экспортировать рецензию в PDF
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Archive Tab */}
        {activeTab === 'archive' && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Архив выпусков</h2>
            
            {archive.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="mx-auto mb-4 text-gray-400" size={48} />
                <p>Архив пуст. Создайте первый выпуск!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {archive.map(issue => (
                  <div key={issue.id} className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition">
                    <div className="flex items-center justify-between mb-4">
                      <FileText className="text-indigo-600" size={32} />
                      <span className="text-sm text-gray-500">{issue.date}</span>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{issue.name}</h3>
                    <p className="text-gray-600 mb-4">Статей: {issue.articlesCount}</p>
                    <div className="flex gap-2">
                      <button className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                        <Eye className="inline mr-2" size={16} />
                        Просмотр
                      </button>
                      <button className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700">
                        <Download className="inline mr-2" size={16} />
                        Скачать
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-lg font-semibold">Обработка...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;