/**
 * Archive storage utilities using localStorage and IndexedDB for large files
 */

const ARCHIVE_METADATA_KEY = 'ai_journal_archive_metadata';
const DB_NAME = 'AIJournalArchive';
const DB_VERSION = 1;
const STORE_NAME = 'pdfFiles';

/**
 * Opens IndexedDB connection
 * @returns {Promise<IDBDatabase>}
 */
const openDatabase = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Ошибка открытия базы данных'));

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

/**
 * Saves PDF blob to IndexedDB
 * @param {number} issueId - Issue ID
 * @param {Blob} pdfBlob - PDF blob
 * @returns {Promise<void>}
 */
export const savePdfBlob = async (issueId, pdfBlob) => {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.put({ id: issueId, blob: pdfBlob });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Ошибка сохранения PDF'));
    });
  } catch (error) {
    console.error('Error saving PDF blob:', error);
    throw error;
  }
};

/**
 * Gets PDF blob from IndexedDB
 * @param {number} issueId - Issue ID
 * @returns {Promise<Blob|null>}
 */
export const getPdfBlob = async (issueId) => {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(issueId);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.blob : null);
      };
      request.onerror = () => reject(new Error('Ошибка получения PDF'));
    });
  } catch (error) {
    console.error('Error getting PDF blob:', error);
    return null;
  }
};

/**
 * Deletes PDF blob from IndexedDB
 * @param {number} issueId - Issue ID
 * @returns {Promise<void>}
 */
export const deletePdfBlob = async (issueId) => {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(issueId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Ошибка удаления PDF'));
    });
  } catch (error) {
    console.error('Error deleting PDF blob:', error);
  }
};

/**
 * Saves archive metadata to localStorage
 * @param {Array} archive - Array of issue metadata
 */
export const saveArchiveMetadata = (archive) => {
  try {
    // Save without the blob (just metadata)
    const metadataOnly = archive.map(issue => ({
      ...issue,
      pdfBlob: null // Don't store blob in localStorage
    }));
    localStorage.setItem(ARCHIVE_METADATA_KEY, JSON.stringify(metadataOnly));
  } catch (error) {
    console.error('Error saving archive metadata:', error);
  }
};

/**
 * Loads archive metadata from localStorage
 * @returns {Array} - Archive metadata array
 */
export const loadArchiveMetadata = () => {
  try {
    const data = localStorage.getItem(ARCHIVE_METADATA_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading archive metadata:', error);
    return [];
  }
};

/**
 * Adds an issue to the archive
 * @param {Object} issue - Issue object
 * @param {Blob} pdfBlob - PDF blob
 * @returns {Promise<Object>} - Updated issue with stored blob reference
 */
export const addToArchive = async (issue, pdfBlob) => {
  try {
    // Save PDF blob to IndexedDB
    await savePdfBlob(issue.id, pdfBlob);

    // Save metadata to localStorage
    const currentArchive = loadArchiveMetadata();
    const updatedArchive = [...currentArchive, { ...issue, hasPdf: true }];
    saveArchiveMetadata(updatedArchive);

    return { ...issue, hasPdf: true };
  } catch (error) {
    console.error('Error adding to archive:', error);
    throw error;
  }
};

/**
 * Removes an issue from the archive
 * @param {number} issueId - Issue ID
 * @returns {Promise<void>}
 */
export const removeFromArchive = async (issueId) => {
  try {
    await deletePdfBlob(issueId);

    const currentArchive = loadArchiveMetadata();
    const updatedArchive = currentArchive.filter(issue => issue.id !== issueId);
    saveArchiveMetadata(updatedArchive);
  } catch (error) {
    console.error('Error removing from archive:', error);
    throw error;
  }
};

/**
 * Gets archive grouped by year and month
 * @returns {Object} - { year: { month: [issues] } }
 */
export const getArchiveByYearMonth = () => {
  const archive = loadArchiveMetadata();
  const grouped = {};

  archive.forEach(issue => {
    const year = issue.year || new Date(issue.date).getFullYear();
    const month = issue.month || new Date(issue.date).getMonth() + 1;

    if (!grouped[year]) {
      grouped[year] = {};
    }
    if (!grouped[year][month]) {
      grouped[year][month] = [];
    }
    grouped[year][month].push(issue);
  });

  return grouped;
};

/**
 * Gets Russian month name
 * @param {number} month - Month number (1-12)
 * @returns {string} - Russian month name
 */
export const getMonthName = (month) => {
  const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  return months[month - 1] || '';
};
