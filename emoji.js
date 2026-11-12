function lt(key, params) {
  return globalThis.NyaitterI18n?.t(key, params) ?? String(key || '');
}

document.addEventListener('DOMContentLoaded', async () => {
	const container = document.getElementById('emoji-container');
	if (!container) return;

	// ルート直下絶対パス (/emoji/...) ではなく、この配信ページのベース基準で解決する。
	const emojiBaseUrl = new URL('emoji/', document.baseURI);
	const isSafeEmojiId = (value) => /^[A-Za-z0-9_-]{1,80}$/.test(String(value || ''));
	const nextFrame =
		window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
	const copyTextToClipboard = async (text) => {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return;
		}

		const textArea = document.createElement('textarea');
		textArea.value = String(text);
		textArea.setAttribute('readonly', '');
		textArea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
		document.body.appendChild(textArea);
		textArea.select();
		const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
		textArea.remove();
		if (!copied) throw new Error('Clipboard API is not available');
	};
			const showMessage = (message, className) => {
			container.replaceChildren();
			const paragraph = document.createElement('p');
			paragraph.className = className;
			paragraph.textContent = message;
			container.appendChild(paragraph);
		};
		const dialogModal = document.getElementById('emoji-dialog-modal');
		const dialogMessage = document.getElementById('emoji-dialog-message');
		const dialogClose = document.getElementById('emoji-dialog-close');
		const dialogAction = document.getElementById('emoji-dialog-action');

		const showEmojiAlert = (message) => {
			if (!dialogModal || !dialogMessage || !dialogClose || !dialogAction)
				return;
			const previousFocus = document.activeElement;
			dialogMessage.textContent = String(message || '');
			dialogModal.classList.remove('hidden');

			const close = () => {
				dialogModal.classList.add('hidden');
				dialogClose.onclick = null;
				dialogAction.onclick = null;
				dialogModal.onclick = null;
				document.removeEventListener('keydown', onKeyDown);
				if (previousFocus instanceof HTMLElement) previousFocus.focus();
			};
			const onKeyDown = (event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					close();
				}
			};

			dialogClose.onclick = close;
			dialogAction.onclick = close;
			dialogModal.onclick = (event) => {
				if (event.target === dialogModal) close();
			};
			document.addEventListener('keydown', onKeyDown);
			nextFrame(() => dialogAction.focus());
		};



	try {
		const response = await fetch(new URL('list.json', emojiBaseUrl), { credentials: 'same-origin' });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const emojiList = await response.json();
		if (!Array.isArray(emojiList) || emojiList.length === 0) {
			showMessage(lt('emoji.not_found'), 'error-text');
			return;
		}

		const fragment = document.createDocumentFragment();
		for (const emoji of emojiList) {
			const emojiId = String(emoji?.id || '');
			if (!isSafeEmojiId(emojiId)) continue;
			const displayName = String(emoji?.name || emojiId).slice(0, 120);

			const card = document.createElement('div');
			card.className = 'emoji-card';
			const image = document.createElement('img');
			image.src = `${emojiBaseUrl.href}${encodeURIComponent(emojiId)}.svg`;
			image.alt = displayName;
			image.className = 'emoji-image';
			image.loading = 'lazy';
			const name = document.createElement('p');
			name.className = 'emoji-name';
			name.textContent = displayName;
			const wrapper = document.createElement('div');
			wrapper.className = 'id-wrapper';
			const code = document.createElement('span');
			code.className = 'emoji-id-code';
			code.title = `_${emojiId}_`;
			code.textContent = `_${emojiId}_`;
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'copy-button';
			button.dataset.emojiId = emojiId;
			button.textContent = lt('common.copy');
			wrapper.append(code, button);
			card.append(image, name, wrapper);
			fragment.appendChild(card);
		}

		if (!fragment.childNodes.length) {
			showMessage(lt('emoji.none_available'), 'error-text');
			return;
		}
		container.replaceChildren(fragment);
		container.addEventListener('click', async (event) => {
			const button = event.target.closest('.copy-button');
			if (!button || !container.contains(button)) return;
			const emojiId = button.dataset.emojiId;
			if (!isSafeEmojiId(emojiId)) return;
			try {
									await copyTextToClipboard(`_${emojiId}_`);

				const originalText = button.textContent;
				button.textContent = lt('post.link_copied');
				button.disabled = true;
				setTimeout(() => {
					button.textContent = originalText;
					button.disabled = false;
				}, 1500);
			} catch (error) {
				console.error('クリップボードへのコピーに失敗しました:', error);
					showEmojiAlert(lt('emoji.copy_failed'));
			}
		});
	} catch (error) {
		console.error('絵文字リストの読み込みに失敗しました:', error);
		showMessage(lt('emoji.list_load_failed'), 'error-text');
	}
});
