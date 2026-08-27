/**
 * Settings screen controller boundary.
 *
 * The legacy implementation is intentionally kept behind this boundary for
 * the first migration step. Feature sections can now be extracted from this
 * controller without changing route ownership or public hash URLs.
 */
import { showSettingsScreen as renderSettingsScreen } from '../settingsScreen.js';

export async function mountSettingsScreen(showScreenFn, context = {}) {
    return renderSettingsScreen({ group: context.group }, showScreenFn, context);
}
