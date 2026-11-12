import { activateScreen } from '../screenManager.js';
import { mountExploreScreen } from './explore/controller.js';

export async function showExploreScreen(showScreenFn) {
    return mountExploreScreen(showScreenFn || activateScreen);
}
