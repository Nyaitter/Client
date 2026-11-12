/**
 * Settings screen controller boundary.
 *
 * Owns the settings route and its public hash URLs; feature sections live in
 * separate modules and are wired in from here.
 */
import { showSettingsScreen as renderSettingsScreen } from '../settingsScreen.js';

export async function mountSettingsScreen(showScreenFn, context = {}) {
    return renderSettingsScreen({ group: context.group }, showScreenFn, context);
}
