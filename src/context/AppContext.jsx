import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { loadArchiveMetadata } from '../utils/archiveStorage';

// Initial state
const initialState = {
  // Articles
  articles: [],
  editingArticle: null,

  // Special pages
  coverPage: null,
  descriptionPage: null,
  finalPage: null,

  // AI Results
  spellCheckResults: [],
  reviewResult: null,

  // UI State
  activeTab: 'editor',
  isProcessing: false,
  processingMessage: '',
  progressCurrent: null,
  progressTotal: null,

  // Archive
  archive: [],

  // Notifications
  notifications: [],

  // Onboarding
  hasSeenOnboarding: localStorage.getItem('hasSeenOnboarding') === 'true',
};

// Action types
const ACTIONS = {
  SET_ARTICLES: 'SET_ARTICLES',
  ADD_ARTICLES: 'ADD_ARTICLES',
  UPDATE_ARTICLE: 'UPDATE_ARTICLE',
  DELETE_ARTICLE: 'DELETE_ARTICLE',
  SET_EDITING_ARTICLE: 'SET_EDITING_ARTICLE',

  SET_COVER_PAGE: 'SET_COVER_PAGE',
  SET_DESCRIPTION_PAGE: 'SET_DESCRIPTION_PAGE',
  SET_FINAL_PAGE: 'SET_FINAL_PAGE',

  ADD_SPELL_CHECK_RESULTS: 'ADD_SPELL_CHECK_RESULTS',
  FIX_SPELLING_ERROR: 'FIX_SPELLING_ERROR',
  SET_REVIEW_RESULT: 'SET_REVIEW_RESULT',

  SET_ACTIVE_TAB: 'SET_ACTIVE_TAB',
  SET_PROCESSING: 'SET_PROCESSING',

  SET_ARCHIVE: 'SET_ARCHIVE',
  ADD_TO_ARCHIVE: 'ADD_TO_ARCHIVE',
  REMOVE_FROM_ARCHIVE: 'REMOVE_FROM_ARCHIVE',

  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',

  SET_ONBOARDING_SEEN: 'SET_ONBOARDING_SEEN',
};

// Reducer
function appReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_ARTICLES:
      return { ...state, articles: action.payload };

    case ACTIONS.ADD_ARTICLES:
      return { ...state, articles: [...state.articles, ...action.payload] };

    case ACTIONS.UPDATE_ARTICLE:
      return {
        ...state,
        articles: state.articles.map(article =>
          article.id === action.payload.id
            ? { ...article, ...action.payload.updates }
            : article
        ),
      };

    case ACTIONS.DELETE_ARTICLE:
      return {
        ...state,
        articles: state.articles.filter(article => article.id !== action.payload),
      };

    case ACTIONS.SET_EDITING_ARTICLE:
      return { ...state, editingArticle: action.payload };

    case ACTIONS.SET_COVER_PAGE:
      return { ...state, coverPage: action.payload };

    case ACTIONS.SET_DESCRIPTION_PAGE:
      return { ...state, descriptionPage: action.payload };

    case ACTIONS.SET_FINAL_PAGE:
      return { ...state, finalPage: action.payload };

    case ACTIONS.ADD_SPELL_CHECK_RESULTS:
      return {
        ...state,
        spellCheckResults: [...state.spellCheckResults, ...action.payload],
      };

    case ACTIONS.FIX_SPELLING_ERROR: {
      const { fileName, errorIndex, word, suggestion } = action.payload;

      // Update article content
      const updatedArticles = state.articles.map(article => {
        if (article.file?.name === fileName) {
          return {
            ...article,
            content: article.content.replace(new RegExp(word, 'g'), suggestion)
          };
        }
        return article;
      });

      // Remove the fixed error from spell check results
      const updatedSpellCheckResults = state.spellCheckResults.map(result => {
        if (result.fileName === fileName) {
          const newErrors = result.errors.filter((_, idx) => idx !== errorIndex);
          return {
            ...result,
            errors: newErrors,
            totalErrors: newErrors.length
          };
        }
        return result;
      });

      return {
        ...state,
        articles: updatedArticles,
        spellCheckResults: updatedSpellCheckResults,
      };
    }

    case ACTIONS.SET_REVIEW_RESULT:
      return { ...state, reviewResult: action.payload };

    case ACTIONS.SET_ACTIVE_TAB:
      return { ...state, activeTab: action.payload };

    case ACTIONS.SET_PROCESSING:
      return {
        ...state,
        isProcessing: action.payload.isProcessing,
        processingMessage: action.payload.message || '',
        progressCurrent: action.payload.current ?? null,
        progressTotal: action.payload.total ?? null,
      };

    case ACTIONS.SET_ARCHIVE:
      return { ...state, archive: action.payload };

    case ACTIONS.ADD_TO_ARCHIVE:
      return { ...state, archive: [...state.archive, action.payload] };

    case ACTIONS.REMOVE_FROM_ARCHIVE:
      return {
        ...state,
        archive: state.archive.filter(issue => issue.id !== action.payload),
      };

    case ACTIONS.ADD_NOTIFICATION:
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };

    case ACTIONS.REMOVE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
      };

    case ACTIONS.SET_ONBOARDING_SEEN:
      localStorage.setItem('hasSeenOnboarding', 'true');
      return { ...state, hasSeenOnboarding: true };

    default:
      return state;
  }
}

// Create context
const AppContext = createContext(null);

// Provider component
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load archive on mount
  useEffect(() => {
    const savedArchive = loadArchiveMetadata();
    dispatch({ type: ACTIONS.SET_ARCHIVE, payload: savedArchive });
  }, []);

  // Action creators
  const actions = {
    setArticles: useCallback((articles) => {
      dispatch({ type: ACTIONS.SET_ARTICLES, payload: articles });
    }, []),

    addArticles: useCallback((articles) => {
      dispatch({ type: ACTIONS.ADD_ARTICLES, payload: articles });
    }, []),

    updateArticle: useCallback((id, updates) => {
      dispatch({ type: ACTIONS.UPDATE_ARTICLE, payload: { id, updates } });
    }, []),

    deleteArticle: useCallback((id) => {
      dispatch({ type: ACTIONS.DELETE_ARTICLE, payload: id });
    }, []),

    setEditingArticle: useCallback((id) => {
      dispatch({ type: ACTIONS.SET_EDITING_ARTICLE, payload: id });
    }, []),

    setCoverPage: useCallback((page) => {
      dispatch({ type: ACTIONS.SET_COVER_PAGE, payload: page });
    }, []),

    setDescriptionPage: useCallback((page) => {
      dispatch({ type: ACTIONS.SET_DESCRIPTION_PAGE, payload: page });
    }, []),

    setFinalPage: useCallback((page) => {
      dispatch({ type: ACTIONS.SET_FINAL_PAGE, payload: page });
    }, []),

    addSpellCheckResults: useCallback((results) => {
      dispatch({ type: ACTIONS.ADD_SPELL_CHECK_RESULTS, payload: results });
    }, []),

    fixSpellingError: useCallback((fileName, errorIndex, word, suggestion) => {
      dispatch({
        type: ACTIONS.FIX_SPELLING_ERROR,
        payload: { fileName, errorIndex, word, suggestion }
      });
    }, []),

    setReviewResult: useCallback((result) => {
      dispatch({ type: ACTIONS.SET_REVIEW_RESULT, payload: result });
    }, []),

    setActiveTab: useCallback((tab) => {
      dispatch({ type: ACTIONS.SET_ACTIVE_TAB, payload: tab });
    }, []),

    setProcessing: useCallback((isProcessing, message = '', current = null, total = null) => {
      dispatch({ type: ACTIONS.SET_PROCESSING, payload: { isProcessing, message, current, total } });
    }, []),

    setArchive: useCallback((archive) => {
      dispatch({ type: ACTIONS.SET_ARCHIVE, payload: archive });
    }, []),

    addToArchive: useCallback((issue) => {
      dispatch({ type: ACTIONS.ADD_TO_ARCHIVE, payload: issue });
    }, []),

    removeFromArchive: useCallback((id) => {
      dispatch({ type: ACTIONS.REMOVE_FROM_ARCHIVE, payload: id });
    }, []),

    // Notification helpers
    showNotification: useCallback((message, type = 'info', duration = 5000) => {
      const id = Date.now() + Math.random();
      dispatch({
        type: ACTIONS.ADD_NOTIFICATION,
        payload: { id, message, type, duration },
      });

      if (duration > 0) {
        setTimeout(() => {
          dispatch({ type: ACTIONS.REMOVE_NOTIFICATION, payload: id });
        }, duration);
      }

      return id;
    }, []),

    removeNotification: useCallback((id) => {
      dispatch({ type: ACTIONS.REMOVE_NOTIFICATION, payload: id });
    }, []),

    showSuccess: useCallback((message) => {
      const id = Date.now() + Math.random();
      dispatch({
        type: ACTIONS.ADD_NOTIFICATION,
        payload: { id, message, type: 'success', duration: 4000 },
      });
      setTimeout(() => {
        dispatch({ type: ACTIONS.REMOVE_NOTIFICATION, payload: id });
      }, 4000);
    }, []),

    showError: useCallback((message) => {
      const id = Date.now() + Math.random();
      dispatch({
        type: ACTIONS.ADD_NOTIFICATION,
        payload: { id, message, type: 'error', duration: 6000 },
      });
      setTimeout(() => {
        dispatch({ type: ACTIONS.REMOVE_NOTIFICATION, payload: id });
      }, 6000);
    }, []),

    setOnboardingSeen: useCallback(() => {
      dispatch({ type: ACTIONS.SET_ONBOARDING_SEEN });
    }, []),
  };

  return (
    <AppContext.Provider value={{ state, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// Custom hook for using context
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Selector hooks for specific state slices
export function useArticles() {
  const { state } = useApp();
  return state.articles;
}

export function useNotifications() {
  const { state, actions } = useApp();
  return {
    notifications: state.notifications,
    showNotification: actions.showNotification,
    showSuccess: actions.showSuccess,
    showError: actions.showError,
    removeNotification: actions.removeNotification,
  };
}

export function useProcessing() {
  const { state, actions } = useApp();
  return {
    isProcessing: state.isProcessing,
    processingMessage: state.processingMessage,
    progressCurrent: state.progressCurrent,
    progressTotal: state.progressTotal,
    setProcessing: actions.setProcessing,
  };
}
