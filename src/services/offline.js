// offline.js — quizzes you can play with no internet.
//
// Two shelves: the official Quickzy library, which ships inside the app, and
// "your quizzes": every quiz you have played solo is kept on this device
// (questions and answers) so the Quickzy app can play it offline too.

const KEY = 'quickzy.offline';
const MAX = 60;

function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); return true; } catch { return false; }
}

/** Keep a quiz (and its answers) on this device. */
export function saveOffline(quiz, key) {
  if (!quiz || !quiz.id || !Array.isArray(key)) return false;
  const slim = {
    id: quiz.id, title: quiz.title || 'Untitled quiz', description: quiz.description || '', cover: quiz.cover || 0,
    ...(quiz.image ? { image: quiz.image } : {}),
    questions: quiz.questions || [], questionCount: (quiz.questions || []).length,
    authorName: quiz.authorName || '', authorUsername: quiz.authorUsername || '', authorBlook: quiz.authorBlook || 'dog',
  };
  return write([{ quiz: slim, key, savedAt: Date.now() }, ...read().filter((x) => x.quiz.id !== quiz.id)]);
}

export const removeOffline = (id) => write(read().filter((x) => x.quiz.id !== id));
export const savedQuizzes = () => read();
export const isSaved = (id) => read().some((x) => x.quiz.id === id);

let lib = null;
/** The official quizzes that come with the app. */
export async function library() {
  lib ||= import('../offline/library.js').then((m) => m.LIBRARY);
  return lib;
}

/** One quiz with its answers: yours first, then the library. */
export async function getOffline(id) {
  return read().find((x) => x.quiz.id === id) || (await library()).find((x) => x.quiz.id === id) || null;
}
