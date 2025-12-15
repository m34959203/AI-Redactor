import React from 'react';
import SpecialPageUpload from './SpecialPageUpload';
import ArticleUploadZone from './ArticleUploadZone';
import ArticlesList from './ArticlesList';

const EditorTab = ({
  articles,
  coverPage,
  descriptionPage,
  finalPage,
  editingArticle,
  isProcessing,
  onCoverUpload,
  onDescriptionUpload,
  onFinalUpload,
  onArticlesUpload,
  onEditArticle,
  onUpdateArticle,
  onDeleteArticle,
  onStopEditing,
  onGeneratePDF,
  fileInputRef,
  coverInputRef,
  descInputRef,
  finalInputRef
}) => {
  return (
    <div className="space-y-6">
      <SpecialPageUpload
        coverPage={coverPage}
        descriptionPage={descriptionPage}
        finalPage={finalPage}
        onCoverUpload={onCoverUpload}
        onDescriptionUpload={onDescriptionUpload}
        onFinalUpload={onFinalUpload}
        coverInputRef={coverInputRef}
        descInputRef={descInputRef}
        finalInputRef={finalInputRef}
      />

      <ArticleUploadZone
        onUpload={onArticlesUpload}
        fileInputRef={fileInputRef}
      />

      {articles.length > 0 && (
        <ArticlesList
          articles={articles}
          editingArticle={editingArticle}
          onEditArticle={onEditArticle}
          onUpdateArticle={onUpdateArticle}
          onDeleteArticle={onDeleteArticle}
          onStopEditing={onStopEditing}
          onGeneratePDF={onGeneratePDF}
          isProcessing={isProcessing}
          coverPage={coverPage}
          descriptionPage={descriptionPage}
          finalPage={finalPage}
        />
      )}
    </div>
  );
};

export default EditorTab;
