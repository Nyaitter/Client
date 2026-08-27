import { activateScreen } from '../screenManager.js';
import { mountDocDetailScreen } from './docs/detailController.js';

export async function showDocDetailScreen(docId, showScreenFn) {
    return mountDocDetailScreen(docId, showScreenFn || activateScreen);
}
