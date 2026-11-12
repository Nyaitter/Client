import { activateScreen } from '../screenManager.js';
import { mountRuleScreen } from './rule/controller.js';

export async function showRuleScreen(showScreenFn) {
    if (typeof showScreenFn !== 'function') {
        showScreenFn = activateScreen;
    }
    return mountRuleScreen(showScreenFn);
}
