import { DOM, openImageModal } from '../dom.js';
import { ICONS } from '../icons.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    getSelectedFiles,
    setSelectedFiles,
    getReplyingTo,
    setReplyingTo,
    getQuotingPost,
    setQuotingPost,
    getPublicProfileCache,
} from '../state.js';
import {
    cacheUser,
    getCachedUser,
    cacheUsers,
    isPinnedPost,
    invalidateTimelinePageCache,
    invalidateProfileTabPageCache,
    normalizePostId,
} from './cache.js';
import { getEmoji, emoji_picker_create } from './format.js';
import { renderNyarkDown } from './nyarkdown.js';
import {
    attachMarkdownContentEditor,
    autoResizeMarkdownEditor,
    getMarkdownEditorValue,
    setMarkdownEditorValue,
    insertMarkdownEditorText,
    setupMarkdownEditorPreviewButton,
} from './editor.js';
import { isDataSaverEnabled } from './theme.js';
import { router } from '../router.js';
import { openReportModal } from '../screens/adminScreen.js';
import { getAccountList, refreshAccountList } from './auth.js';
import {
    escapeHTML,
    getUserIconUrl,
    getSafeHttpUrl,
    getNyaitterId,
    formatPostTimestamp,
    configureAttachmentImage,
    appendUrlCard,
    compressImage,
    showLoading,
    showAppAlert,
    showAppConfirm,
    copyTextToClipboard,
    renderGroupBadgesElement,
    getGroupIconUrl,
} from '../utils/helpers.js';

export const METRICS_FALLBACK = '?';

export async function uploadFileViaEdgeFunction(file, { asUserId = null } = {}) {
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
    const normalizedAsUserId = Number(asUserId);
    const { data, error } = await apiRequest('/server/api/uploads', {
        method: 'POST',
        body: {
            file: base64,
            fileName: file.name,
            contentType: file.type,
            ...(Number.isInteger(normalizedAsUserId) && normalizedAsUserId > 0
                ? { as_user_id: normalizedAsUserId }
                : {}),
        },
    });

    if (error) {
        throw new Error(`ファイルアップロードに失敗しました: ${error.message}`);
    }

    const responseData = data.data || data;
    if (responseData.error) {
        throw new Error(`ファイルアップロードに失敗しました: ${responseData.error}`);
    }

    return responseData.id;
}

export async function deleteFilesViaEdgeFunction(fileIds, { asUserId = null } = {}) {
    if (!fileIds || fileIds.length === 0) return;
    const normalizedAsUserId = Number(asUserId);
    const { error } = await apiRequest('/server/api/uploads', {
        method: 'DELETE',
        body: {
            fileIds,
            ...(Number.isInteger(normalizedAsUserId) && normalizedAsUserId > 0
                ? { as_user_id: normalizedAsUserId }
                : {}),
        },
    });
    if (error) {
        console.error('ファイルの削除に失敗しました:', error.message);
    }
}

export function filterBlockedPosts(posts) {
    const currentUser = getCurrentUser();
    if (!currentUser || !Array.isArray(posts)) return posts || [];
    const blockedIds = new Set(
        (currentUser.block || []).map((id) => Number(id)),
    );
    return posts.filter((post) => {
        const authorId = Number(post?.author?.id ?? post?.userid);
        return !blockedIds.has(authorId);
    });
}

export async function ensureMentionedUsersCached(contents = []) {
    const mentionRegex = /@(\d+)/g;
    const missingUserIds = new Set();

    contents.forEach((content) => {
        if (!content || typeof content !== 'string') return;
        let match;
        mentionRegex.lastIndex = 0;
        while ((match = mentionRegex.exec(content)) !== null) {
            const userId = parseInt(match[1], 10);
            if (Number.isInteger(userId) && !getCachedUser(userId)) {
                missingUserIds.add(userId);
            }
        }
    });

    if (missingUserIds.size === 0) return;

    try {
        const { data: users } = await api
            .from('user')
            .in('id', Array.from(missingUserIds));
        if (users) cacheUsers(users);
    } catch (_) {}
}

export function isPostReactionActive(post, serverField, accountField) {
    const serverState = post?.[serverField];
    if (typeof serverState === 'boolean') return serverState;

    const currentUser = getCurrentUser();
    const postId = Number(post?.id);
    return (
        Number.isFinite(postId) &&
        Array.isArray(currentUser?.[accountField]) &&
        currentUser[accountField].some((id) => Number(id) === postId)
    );
}

export function renderUnknownPostReference(post) {
    const postEl = document.createElement('div');
    postEl.className = 'post unknown-post';
    if (Number.isInteger(Number(post?.id))) {
        postEl.dataset.postId = String(post.id);
    }

    const postMain = document.createElement('div');
    postMain.className = 'post-main';
    const postHeader = document.createElement('div');
    postHeader.className = 'post-header';
    const authorName = document.createElement('span');
    authorName.className = 'post-author-name';
    authorName.textContent = 'UnknownPost';
    const account = document.createElement('span');
    account.className = 'post-time';
    account.textContent = '@unknown';
    postHeader.append(authorName, account);

    const message = document.createElement('div');
    message.className = 'deleted-post-container';
    message.textContent = '不明なポストです。';
    postMain.append(postHeader, message);
    postEl.appendChild(postMain);
    return postEl;
}

export async function renderPost(post, author, options = {}) {
    if (!post) return null;
    if (post.unknown) return renderUnknownPostReference(post);
    if (filterBlockedPosts([post]).length === 0) return null;
    await ensureMentionedUsersCached([post.content]);

    const {
        isNested = false,
        isDirectReply = false,
        userCache = new Map(),
        metricsPromise,
        isPinned = false,
        clampHeight = false,
        onReportClick,
    } = options;

    const displayAuthor = author || post.author;
    if (!displayAuthor) return null;
    cacheUser(displayAuthor);

    const isSimpleRepost = post.repost_to && !post.content;

    if (isSimpleRepost) {
        const authorOfRepost = displayAuthor;
        const originalPost = post.reposted_post;

        if (!originalPost) {
            const deletedPostWrapper = document.createElement('div');
            deletedPostWrapper.className = 'post';
            deletedPostWrapper.dataset.postId = post.id;

            const deletedPostMain = document.createElement('div');
            deletedPostMain.className = 'post-main';

            const repostIndicator = document.createElement('div');
            repostIndicator.className = 'repost-indicator';
            repostIndicator.innerHTML = `${ICONS.repost} <a href="#profile/${authorOfRepost.id}">${getEmoji(escapeHTML(authorOfRepost.name))}</a><span> さんがリポストしました</span>`;
            deletedPostMain.appendChild(repostIndicator);

            const deletedContainer = document.createElement('div');
            deletedContainer.className = 'deleted-post-container';
            deletedContainer.textContent = 'このポストは削除されました。';
            deletedPostMain.appendChild(deletedContainer);

            deletedPostWrapper.appendChild(deletedPostMain);
            return deletedPostWrapper;
        }

        const postEl = await renderPost(originalPost, originalPost.author, {
            ...options,
            isNested: false,
            metricsPromise,
        });
        if (!postEl) return null;

        postEl.dataset.postId = post.id;
        postEl.dataset.actionTargetId = originalPost.id;

        const repostedPostMain = postEl.querySelector('.post-main');
        if (repostedPostMain) {
            const repostIndicator = document.createElement('div');
            repostIndicator.className = 'repost-indicator';
            repostIndicator.innerHTML = `${ICONS.repost} <a href="#profile/${authorOfRepost.id}">${getEmoji(escapeHTML(authorOfRepost.name))}</a><span> さんがリポストしました</span>`;
            repostedPostMain.prepend(repostIndicator);

            const postHeader = repostedPostMain.querySelector('.post-header');
            if (postHeader) {
                postHeader.querySelector('.post-menu-btn')?.remove();
                postHeader.querySelector('.post-menu')?.remove();
                postHeader.classList.remove('has-post-menu');

                if (
                    getCurrentUser() &&
                    !isNested &&
                    (Number(getCurrentUser().id) === Number(post.userid) || getCurrentUser().admin)
                ) {
                    postHeader.classList.add('has-post-menu');
                    const menuBtn = document.createElement('button');
                    menuBtn.type = 'button';
                    menuBtn.className = 'post-menu-btn';
                    menuBtn.title = 'ポストメニュー';
                    menuBtn.setAttribute('aria-label', 'ポストメニュー');
                    menuBtn.innerHTML = ICONS.more;
                    const menu = document.createElement('div');
                    menu.className = 'post-menu';
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'delete-btn';
                    deleteBtn.textContent = 'リポストを削除';
                    menu.appendChild(deleteBtn);
                    postHeader.appendChild(menuBtn);
                    postHeader.appendChild(menu);
                }
            }
        }
        return postEl;
    }

    if (!author && !post.author) return null;

    const postEl = document.createElement('div');
    postEl.className = 'post';
    postEl.dataset.postId = post.id;
    postEl.dataset.actionTargetId = post.id;
    postEl._nyaitterPost = post;
    postEl._displayAuthor = displayAuthor;

    const userIconLink = document.createElement('a');
    userIconLink.href = `#profile/${displayAuthor.id}`;
    userIconLink.className = 'user-icon-link';
    const userIcon = document.createElement('img');
    userIcon.src = getUserIconUrl(displayAuthor);
    userIcon.className = 'user-icon';
    userIcon.alt = `${displayAuthor.name}'s icon`;
    userIconLink.appendChild(userIcon);
    postEl.appendChild(userIconLink);

    const postMain = document.createElement('div');
    postMain.className = 'post-main';

    if (isPinned) {
        const pinnedDiv = document.createElement('div');
        pinnedDiv.className = 'pinned-indicator';
        pinnedDiv.innerHTML = `${ICONS.pin} <span>ピン留めされたポスト</span>`;
        postMain.appendChild(pinnedDiv);
    } else if (!isDirectReply) {
        if (post.reply_to_post && post.reply_to_post.author) {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'replying-to';
            replyDiv.innerHTML = `<a href="#profile/${post.reply_to_post.author.id}">@${getEmoji(escapeHTML(post.reply_to_post.author.name))}</a><span> さんに返信</span>`;
            postMain.appendChild(replyDiv);
        } else if (post.reply_to_user_id && post.reply_to_user_name) {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'replying-to';
            replyDiv.innerHTML = `<a href="#profile/${post.reply_to_user_id}">@${getEmoji(escapeHTML(post.reply_to_user_name))}</a><span> さんに返信</span>`;
            postMain.appendChild(replyDiv);
        } else if (post.reply_to_post?.unknown) {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'replying-to';
            replyDiv.innerHTML = `<span>不明なポストに返信</span>`;
            postMain.appendChild(replyDiv);
        }
    }

    const postHeader = document.createElement('div');
    postHeader.className = 'post-header';
    const authorLink = document.createElement('a');
    authorLink.href = `#profile/${displayAuthor.id}`;
    authorLink.className = 'post-author';
    const authorName = document.createElement('span');
    authorName.className = 'post-author-name';
    authorName.innerHTML = getEmoji(escapeHTML(displayAuthor.name || '不明'));
    authorLink.appendChild(authorName);
    postHeader.appendChild(authorLink);

    if (displayAuthor.admin) {
        const adminBadge = document.createElement('img');
        adminBadge.src = 'icons/admin.png';
        adminBadge.className = 'admin-badge';
        adminBadge.title = 'NyaitterTeam';
        authorLink.appendChild(adminBadge);
    } else if (displayAuthor.verify) {
        const verifyBadge = document.createElement('img');
        verifyBadge.src = 'icons/verify.png';
        verifyBadge.className = 'verify-badge';
        verifyBadge.title = '認証済み';
        authorLink.appendChild(verifyBadge);
    }

    const groupBadgesEl = renderGroupBadgesElement(displayAuthor);
    if (groupBadgesEl) {
        postHeader.appendChild(groupBadgesEl);
    }

    const postTime = document.createElement('span');
    postTime.className = 'post-time';
    postTime.textContent = `${getNyaitterId(displayAuthor)} · ${formatPostTimestamp(post)}`;
    postHeader.appendChild(postTime);

    if (post.groupId || post.group_id) {
        const groupIndicator = document.createElement('span');
        groupIndicator.className = 'group-post-indicator';
        groupIndicator.textContent = post.group_announcement || post.groupAnnouncement
            ? 'グループアナウンス'
            : 'グループ投稿';
        postHeader.appendChild(groupIndicator);
    }

    if (post.private || post.lock) {
        const lockIndicator = document.createElement('span');
        lockIndicator.className = 'post-lock-indicator';
        lockIndicator.title = 'プライベート';
        lockIndicator.setAttribute('aria-label', 'プライベート');
        lockIndicator.innerHTML = ICONS.lock;
        postHeader.appendChild(lockIndicator);
    }

    if (getCurrentUser()) {
        const currentUser = getCurrentUser();
        const isPostOwner = Number(currentUser.id) === Number(post.userid || post.userId);

        postHeader.classList.add('has-post-menu');
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'post-menu-btn';
        menuBtn.title = 'ポストメニュー';
        menuBtn.setAttribute('aria-label', 'ポストメニュー');
        menuBtn.innerHTML = ICONS.more;
        const menu = document.createElement('div');
        menu.className = 'post-menu';

        const shareBtn = document.createElement('button');
        shareBtn.className = 'share-btn';
        shareBtn.textContent = 'URLをコピー';
        menu.appendChild(shareBtn);

        if (!isPostOwner) {
            const dislikeBtn = document.createElement('button');
            dislikeBtn.className = 'dislike-btn';
            dislikeBtn.textContent = '関連性が低いと評価';
            menu.appendChild(dislikeBtn);

            const isFollowing = Array.isArray(currentUser.follow) && currentUser.follow.some((id) => Number(id) === Number(displayAuthor.id));
            const followBtn = document.createElement('button');
            followBtn.className = 'follow-menu-btn';
            followBtn.textContent = isFollowing
                ? `@${displayAuthor.name || 'ユーザー'} のフォローを解除`
                : `@${displayAuthor.name || 'ユーザー'} をフォロー`;
            menu.appendChild(followBtn);

            const isBlocked = Array.isArray(currentUser.block) && currentUser.block.some((id) => Number(id) === Number(displayAuthor.id));
            const blockBtn = document.createElement('button');
            blockBtn.className = 'block-menu-btn';
            blockBtn.textContent = isBlocked
                ? `@${displayAuthor.name || 'ユーザー'} のブロックを解除`
                : `@${displayAuthor.name || 'ユーザー'} をブロック`;
            menu.appendChild(blockBtn);

            const reportBtn = document.createElement('button');
            reportBtn.className = 'report-btn';
            reportBtn.textContent = '報告する';
            reportBtn.onclick = (event) => {
                event.stopPropagation();
                if (typeof onReportClick === 'function') {
                    onReportClick(post);
                } else {
                    openReportModal({
                        targetKind: 'post',
                        targetId: post.id,
                        targetLabel: 'このポスト',
                    });
                }
                menu.classList.remove('is-visible');
            };
            menu.appendChild(reportBtn);
        } else {
            const pinBtn = document.createElement('button');
            pinBtn.className = 'pin-btn';
            pinBtn.textContent = isPinnedPost(post.id) ? 'ピン留めを解除' : 'ピン留め';
            menu.appendChild(pinBtn);

            if (!post.repost_to || post.content) {
                const editBtn = document.createElement('button');
                editBtn.className = 'edit-btn';
                editBtn.textContent = '編集';
                menu.appendChild(editBtn);

                const isReply = Boolean(post.reply_id || post.replyTo || post.reply_to || post.reply_to_post);
                if (!isReply) {
                    const replyControlBtn = document.createElement('button');
                    replyControlBtn.className = 'reply-control-menu-btn';
                    replyControlBtn.textContent = '返信可能なユーザーの変更';
                    menu.appendChild(replyControlBtn);
                }
            }
        }

        if (isPostOwner || currentUser.admin) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '削除';
            menu.appendChild(deleteBtn);
        }

        postHeader.appendChild(menuBtn);
        postHeader.appendChild(menu);
    }
    postMain.appendChild(postHeader);

    if (post.content) {
        const postContent = document.createElement('div');
        postContent.className = 'post-content';

        if (post.mask) {
            postContent.classList.add('hidden');
            if (post.content.startsWith('!')) {
                const masktitle = document.createElement('div');
                masktitle.className = 'post-content post-mask-title';
                masktitle.innerHTML = renderNyarkDown(
                    post.content.split('\n')[0].slice(1),
                    userCache,
                    { allowMarkdown: true, allowContentDecorations: true },
                );
                postMain.appendChild(masktitle);
                postContent.innerHTML = renderNyarkDown(
                    post.content.slice(1),
                    userCache,
                    { allowMarkdown: true, allowContentDecorations: true },
                );
            } else {
                postContent.innerHTML = renderNyarkDown(
                    post.content,
                    userCache,
                    { allowMarkdown: true, allowContentDecorations: true },
                );
            }
        } else {
            postContent.innerHTML = renderNyarkDown(
                post.content,
                userCache,
                { allowMarkdown: true, allowContentDecorations: true },
            );
        }
        postMain.appendChild(postContent);
        if (!post.mask) {
            appendUrlCard(postMain, post.content, {
                hasExistingQuote: Boolean(post.repost_to && post.reposted_post),
                renderPost,
                options,
            });
        }
    }

    if (post.mask) {
        const postAlert = document.createElement('button');
        postAlert.className = 'post-mask-alert';
        postAlert.innerText = 'このポストにはワンクッションが付与されています';
        postMain.appendChild(postAlert);
    }

    if (post.attachments && post.attachments.length > 0) {
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.className = 'attachments-container';
        if (post.mask) {
            attachmentsContainer.classList.add('hidden');
        } else if (post.attachments.length > 2) {
            const postAlert = document.createElement('button');
            postAlert.className = 'post-mask-alert';
            postAlert.innerText = `${post.attachments.length}件のファイル`;
            postMain.appendChild(postAlert);
            attachmentsContainer.classList.add('hidden');
        }

        if (isNested) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'attachment-item';
            const fileinfo = document.createElement('p');
            fileinfo.className = 'attachment-fileinfo';
            fileinfo.textContent = `📄 ${post.attachments.length}件のファイル`;
            itemDiv.appendChild(fileinfo);
            attachmentsContainer.appendChild(itemDiv);
        } else {
            const allImageAttachments = post.attachments.filter((a) => a.type === 'image');
            const allImageUrls = allImageAttachments.map((a) => {
                const { data } = api.storage.from('nyaitter').getPublicUrl(a.id);
                return getSafeHttpUrl(data?.publicUrl);
            }).filter(Boolean);

            let currentImageIndex = 0;
            for (const attachment of post.attachments) {
                const { data: publicUrlData } = api.storage
                    .from('nyaitter')
                    .getPublicUrl(attachment.id);
                const publicURL = getSafeHttpUrl(publicUrlData?.publicUrl);
                if (!publicURL) continue;
                const attachmentName = String(attachment.name || '添付ファイル').slice(0, 255);

                const itemDiv = document.createElement('div');
                itemDiv.className = 'attachment-item';

                if (attachment.type === 'image') {
                    const img = document.createElement('img');
                    configureAttachmentImage(img, attachment, publicURL);
                    img.alt = attachmentName;
                    img.className = 'attachment-image';
                    const targetIndex = currentImageIndex++;
                    img.onclick = (e) => {
                        e.stopPropagation();
                        openImageModal(publicURL, { images: allImageUrls, index: targetIndex });
                    };
                    itemDiv.appendChild(img);
                } else if (attachment.type === 'video') {
                    const video = document.createElement('video');
                    video.src = publicURL;
                    video.controls = true;
                    video.preload = isDataSaverEnabled() ? 'metadata' : 'auto';
                    video.onclick = (e) => e.stopPropagation();
                    itemDiv.appendChild(video);
                } else if (attachment.type === 'audio') {
                    const audio = document.createElement('audio');
                    audio.src = publicURL;
                    audio.controls = true;
                    audio.onclick = (e) => e.stopPropagation();
                    itemDiv.appendChild(audio);
                } else {
                    const downloadLink = document.createElement('a');
                    downloadLink.href = '#';
                    downloadLink.className = 'attachment-download-link';
                    downloadLink.textContent = `📄 ${attachmentName}`;
                    downloadLink.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.handleDownload?.(publicURL, attachmentName);
                    };
                    itemDiv.appendChild(downloadLink);
                }
                attachmentsContainer.appendChild(itemDiv);
            }
        }
        postMain.appendChild(attachmentsContainer);
    }

    if ((post.repost_to || post.reposted_post) && post.content) {
        const nestedContainer = document.createElement('div');
        nestedContainer.className = 'nested-repost-container';
        if (post.reposted_post) {
            const nestedPostEl = await renderPost(
                post.reposted_post,
                post.reposted_post.author,
                { ...options, isNested: true, clampHeight: true },
            );
            if (nestedPostEl) {
                nestedContainer.appendChild(nestedPostEl);
            }
        } else {
            const deletedContainer = document.createElement('div');
            deletedContainer.className = 'deleted-post-container';
            deletedContainer.textContent = 'このポストは削除されました。';
            nestedContainer.appendChild(deletedContainer);
        }
        postMain.appendChild(nestedContainer);
    }

    if (getCurrentUser() && !isNested) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'post-actions';
        const actionTargetPost = isSimpleRepost && post.reposted_post ? post.reposted_post : post;

        if (actionTargetPost) {
            const replyBtn = document.createElement('button');
            replyBtn.className = 'reply-button';
            const replyAuthor = actionTargetPost.author
                || actionTargetPost.user
                || displayAuthor;
            replyBtn.dataset.username = String(replyAuthor?.name || '');
            replyBtn.dataset.isPrivate = String(
                Boolean(actionTargetPost.private || actionTargetPost.lock || replyAuthor?.settings?.lock),
            );
            replyBtn._nyaitterPost = actionTargetPost;

            const currentUser = getCurrentUser();
            let canReply = true;
            if (actionTargetPost.can_reply !== undefined) {
                canReply = Boolean(actionTargetPost.can_reply);
            } else if (!currentUser) {
                canReply = false;
            } else if (Number(actionTargetPost.userid || actionTargetPost.userId) === Number(currentUser.id)) {
                canReply = true;
            } else {
                const replyControl = actionTargetPost.reply_control || actionTargetPost.replyControl || 'everyone';
                if (replyControl === 'mentioned') {
                    canReply = Boolean(actionTargetPost.content && new RegExp(`@${currentUser.id}\\b`).test(actionTargetPost.content));
                }
            }

            if (!canReply) {
                replyBtn.disabled = true;
                replyBtn.classList.add('disabled');
                replyBtn.title = 'このポストに返信できるユーザーが制限されています';
                replyBtn.setAttribute('aria-disabled', 'true');
            }

            replyBtn.innerHTML = `${ICONS.reply} <span>---</span>`;
            actionsDiv.appendChild(replyBtn);

            const likeBtn = document.createElement('button');
            likeBtn.className = `like-button ${isPostReactionActive(actionTargetPost, 'liked_by_me', 'like') ? 'liked' : ''}`;
            likeBtn.innerHTML = `${ICONS.likes} <span>---</span>`;
            actionsDiv.appendChild(likeBtn);

            const starBtn = document.createElement('button');
            starBtn.className = `star-button ${isPostReactionActive(actionTargetPost, 'starred_by_me', 'star') ? 'starred' : ''}`;
            starBtn.innerHTML = `${ICONS.stars} <span>---</span>`;
            actionsDiv.appendChild(starBtn);

            const repostBtn = document.createElement('button');
            repostBtn.className = 'repost-button';
            repostBtn.innerHTML = `${ICONS.repost} <span>---</span>`;
            repostBtn._nyaitterPost = actionTargetPost;
            actionsDiv.appendChild(repostBtn);

            (async () => {
                await metricsPromise;
                const replyCount = actionTargetPost.reply_count ?? METRICS_FALLBACK;
                const likeCount = actionTargetPost.like_count ?? METRICS_FALLBACK;
                const starCount = actionTargetPost.star_count ?? METRICS_FALLBACK;
                const repostCount = actionTargetPost.repost_count ?? METRICS_FALLBACK;

                replyBtn.innerHTML = `${ICONS.reply} <span>${replyCount}</span>`;
                likeBtn.innerHTML = `${ICONS.likes} <span>${likeCount}</span>`;
                starBtn.innerHTML = `${ICONS.stars} <span>${starCount}</span>`;
                repostBtn.innerHTML = `${ICONS.repost} <span>${repostCount}</span>`;
            })();
        }

        postMain.appendChild(actionsDiv);
    }

    postEl.appendChild(postMain);

    if (clampHeight && !post.mask && post.content) {
        postEl.dataset.clampContent = '1';
        const contentEl = postMain.querySelector('.post-content');
        if (contentEl) {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'post-clamp-toggle';
            toggleBtn.textContent = '続きを表示';
            toggleBtn.addEventListener('click', () => {
                const expanded = contentEl.classList.toggle('post-content-expanded');
                toggleBtn.textContent = expanded ? '閉じる' : '続きを表示';
                toggleBtn.classList.toggle('expanded', expanded);
            });
            contentEl.after(toggleBtn);

            const measure = () => {
                if (!postEl.isConnected || !contentEl.isConnected) return null;
                const wasExpanded = contentEl.classList.contains('post-content-expanded');
                if (!wasExpanded) contentEl.classList.add('post-content-expanded');
                const naturalHeight = contentEl.getBoundingClientRect().height;
                if (!wasExpanded) contentEl.classList.remove('post-content-expanded');
                const clampLimit = Number.parseFloat(window.getComputedStyle(contentEl).maxHeight);
                if (Number.isFinite(clampLimit) && naturalHeight > clampLimit + 1) {
                    toggleBtn.classList.add('is-visible');
                }
                return true;
            };
            let attempts = 0;
            const timer = setInterval(() => {
                if (measure() === true || ++attempts >= 20) clearInterval(timer);
            }, 50);
        }
    }

    return postEl;
}

function getPostingAccountId(container) {
    const selectedId = Number(container?.dataset.postAsUserId);
    if (Number.isInteger(selectedId) && selectedId > 0) return selectedId;
    return Number(getCurrentUser()?.id) || null;
}

function closePostAccountMenu(container) {
    const menu = container.querySelector('.post-account-menu');
    if (!menu) return;
    menu.classList.add('hidden');
    menu.innerHTML = '';
    container.querySelector('.post-account-selector')?.setAttribute('aria-expanded', 'false');
    if (container._postAccountMenuOutsideHandler) {
        document.removeEventListener('pointerdown', container._postAccountMenuOutsideHandler, true);
        delete container._postAccountMenuOutsideHandler;
    }
}

function setPostingAccount(container, account) {
    const accountId = Number(account?.id);
    if (!Number.isInteger(accountId) || accountId <= 0) return;
    const previousAccountId = Number(container?.dataset.postAsUserId);
    const accountChanged = !Number.isInteger(previousAccountId) || previousAccountId !== accountId;
    container.dataset.postAsUserId = String(accountId);
    container._postingAccount = account;
    const selector = container.querySelector('.post-account-selector');
    const icon = selector?.querySelector('.user-icon');
    if (icon) {
        icon.src = getUserIconUrl(account);
        icon.alt = `${account.name || 'アカウント'}のアイコン`;
    }
    if (selector) {
        selector.title = `投稿アカウント: ${account.name || '不明なユーザー'}`;
        selector.setAttribute('aria-label', selector.title);
    }
    const announcementButton = container.querySelector('.post-announcement-button');
    if (announcementButton && !getPostingGroup(container)) {
        announcementButton.hidden = !account.admin;
        announcementButton.classList.toggle('hidden', !account.admin);
        announcementButton.title = 'Nyaitterアナウンス';
        announcementButton.setAttribute('aria-label', announcementButton.title);
    }
    if (accountChanged) {
        const postingAccountVersion = Number(container._postingAccountVersion || 0) + 1;
        container._postingAccountVersion = postingAccountVersion;
        void syncPostGroupDestinationsForPostingAccount(container, postingAccountVersion);
    }
}

async function openPostAccountMenu(container) {
    const menu = container.querySelector('.post-account-menu');
    const selector = container.querySelector('.post-account-selector');
    const form = container.querySelector('.post-form');
    if (!menu || !selector || !form) return;
    if (!menu.classList.contains('hidden')) {
        closePostAccountMenu(container);
        return;
    }

    menu.classList.remove('hidden');
    menu.innerHTML = '<div class="post-account-menu-loading"><span class="spinner" aria-label="アカウント一覧を読み込み中"></span></div>';
    selector.setAttribute('aria-expanded', 'true');
    const outsideHandler = (event) => {
        if (!form.contains(event.target)) closePostAccountMenu(container);
    };
    container._postAccountMenuOutsideHandler = outsideHandler;
    document.addEventListener('pointerdown', outsideHandler, true);

    try {
        let accounts = getAccountList();
        if (accounts.length === 0) {
            accounts = await refreshAccountList();
            if (menu.classList.contains('hidden')) return;
        }
        if (accounts.length === 0 && getCurrentUser()) {
            accounts = [getCurrentUser()];
        }
        const selectedId = getPostingAccountId(container);
        if (accounts.length === 0) {
            menu.innerHTML = '<p class="post-account-menu-empty">利用可能なアカウントがありません。</p>';
            return;
        }

        menu.innerHTML = '';
        accounts.forEach((account) => {
            const accountId = Number(account.id);
            if (!Number.isInteger(accountId) || accountId <= 0) return;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'post-account-menu-item';
            item.classList.toggle('active', accountId === selectedId);
            item.setAttribute('aria-pressed', String(accountId === selectedId));
            item.innerHTML = `
                <img src="${escapeHTML(getUserIconUrl(account))}" alt="" class="post-account-menu-icon">
                <span class="post-account-menu-user">
                    <strong>${getEmoji(escapeHTML(account.name || '不明なユーザー'))}</strong>
                    <small>${escapeHTML(getNyaitterId(account))}</small>
                </span>
                ${account.is_imposter ? '<span class="settings-session-current">インポスター</span>' : ''}
            `;
            item.addEventListener('click', () => {
                setPostingAccount(container, account);
                closePostAccountMenu(container);
            });
            menu.appendChild(item);
        });
    } catch (error) {
        if (!menu.classList.contains('hidden')) {
            menu.innerHTML = '<p class="post-account-menu-empty">アカウント一覧を読み込めませんでした。</p>';
        }
    }
}

export function createPostFormHTML(isModal = false) {
    const currentUser = getCurrentUser();
    return `
        <div class="post-form">
            <button type="button" class="post-account-selector" title="投稿アカウント: ${escapeHTML(currentUser?.name || '不明なユーザー')}" aria-label="投稿アカウント: ${escapeHTML(currentUser?.name || '不明なユーザー')}" aria-haspopup="menu" aria-expanded="false">
                <img src="${getUserIconUrl(currentUser)}" class="user-icon" alt="${escapeHTML(currentUser?.name || 'アカウント')}のアイコン">
            </button>
            <div class="post-account-menu hidden" role="menu"></div>
            ${isModal ? '<button class="modal-close-btn">×</button>' : ''}
            <div class="form-content">
                <div id="reply-info" class="hidden" style="margin-bottom: 0.5rem; color: var(--secondary-text-color);"></div>
                <div class="markdown-textarea-editor post-content-editor"><textarea id="post-content" class="markdown-content-editor" rows="3" spellcheck="true" data-markdown-content-editor data-server-input-limit="post_content_length" placeholder="いまどうしてる？"></textarea><div class="markdown-editor-paint" aria-hidden="true"><div class="markdown-editor-placeholder"></div><div class="markdown-editor-preview hidden"></div><div class="markdown-editor-selection"></div><div class="markdown-editor-composition"></div><div class="markdown-editor-caret"></div></div></div>
                <div class="file-preview-container"></div>
                ${isModal ? '<div id="quoting-preview-container"></div>' : ''}
                <div class="post-form-actions">
                    <button type="button" class="attachment-button float-left" title="ファイルを添付">
                        ${ICONS.attachment}
                    </button>
                    <button type="button" class="emoji-pic-button float-left" title="絵文字を選択">
                        ${ICONS.emoji}
                    </button>
                    <input type="file" id="file-input" class="hidden" multiple>
                    <div id="emoji-picker" class="hidden"></div>
                    <div class="post-group-menu hidden" role="menu"></div>
                    <div class="post-reply-control-menu hidden" role="menu"></div>
                    <button id="post-submit-button" class="float-right">ポスト</button>
                    <button type="button" class="post-group-button float-right" title="投稿先: Nyaitter" aria-label="投稿先: Nyaitter" aria-haspopup="menu" aria-expanded="false">${ICONS.group}</button>
                    <button type="button" class="post-reply-control-button float-right" title="返信可能なユーザー: 誰でも" aria-label="返信可能なユーザー: 誰でも" aria-haspopup="menu" aria-expanded="false">${ICONS.reply_control}</button>
                    <button type="button" class="post-mask-button float-right" title="ワンクッション">
                        ${ICONS.mask}
                    </button>
                    <button type="button" class="post-lock-button float-right" title="プライベート" aria-pressed="false">
                        ${ICONS.lock}
                    </button>
                    <button type="button" class="post-announcement-button float-right hidden" title="Nyaitterアナウンス" aria-pressed="false">${ICONS.megaphone}</button>
                    <span class="float-clear"></span>
                </div>
            </div>
        </div>`;
}

const REPLY_CONTROL_OPTIONS = [
    {
        id: 'everyone',
        title: '誰でも返信可能',
        description: '全てのユーザーが返信できます',
        icon: ICONS.globe,
        buttonTitle: '返信可能なユーザー: 誰でも',
    },
    {
        id: 'following',
        title: 'フォローしている/メンションしたユーザーのみ返信可能',
        description: 'フォロー中のユーザーとメンションされたユーザー',
        icon: ICONS.user_check,
        buttonTitle: '返信可能なユーザー: フォロー中またはメンション',
    },
    {
        id: 'mentioned',
        title: 'メンションしたユーザーのみ返信可能',
        description: 'このポストでメンションされたユーザーのみ',
        icon: ICONS.mention,
        buttonTitle: '返信可能なユーザー: メンションしたユーザーのみ',
    },
];

function getPostingReplyControl(container) {
    return container?._replyControl || 'everyone';
}

function setPostingReplyControl(container, control = 'everyone') {
    if (!container) return;
    const normalized = ['everyone', 'following', 'mentioned'].includes(control) ? control : 'everyone';
    container._replyControl = normalized;
    const button = container.querySelector('.post-reply-control-button');
    const option = REPLY_CONTROL_OPTIONS.find((opt) => opt.id === normalized) || REPLY_CONTROL_OPTIONS[0];
    if (button) {
        button.title = option.buttonTitle;
        button.setAttribute('aria-label', option.buttonTitle);
        button.classList.toggle('active', normalized !== 'everyone');
    }
}

function closePostReplyControlMenu(container) {
    const menu = container?.querySelector('.post-reply-control-menu');
    const button = container?.querySelector('.post-reply-control-button');
    menu?.classList.add('hidden');
    button?.setAttribute('aria-expanded', 'false');
    if (container?._postReplyControlMenuOutsideHandler) {
        document.removeEventListener('pointerdown', container._postReplyControlMenuOutsideHandler, true);
        container._postReplyControlMenuOutsideHandler = null;
    }
}

function bindPostReplyControlMenuOutsideHandler(container) {
    if (!container || container._postReplyControlMenuOutsideHandler) return;
    const handler = (event) => {
        const menu = container.querySelector('.post-reply-control-menu');
        const button = container.querySelector('.post-reply-control-button');
        if (!menu || menu.classList.contains('hidden') || menu.contains(event.target) || button?.contains(event.target)) return;
        closePostReplyControlMenu(container);
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    container._postReplyControlMenuOutsideHandler = handler;
    document.addEventListener('pointerdown', handler, true);
}

function renderPostReplyControlMenu(container) {
    const menu = container?.querySelector('.post-reply-control-menu');
    if (!menu) return;
    const current = getPostingReplyControl(container);
    menu.innerHTML = REPLY_CONTROL_OPTIONS.map((opt) => {
        const selected = opt.id === current;
        return `<button type="button" class="post-reply-control-menu-item ${selected ? 'active' : ''}" data-reply-control="${opt.id}" aria-pressed="${String(selected)}">
            <span class="post-reply-control-menu-icon" aria-hidden="true">${opt.icon}</span>
            <span class="post-reply-control-menu-copy">
                <strong>${escapeHTML(opt.title)}</strong>
                <small>${escapeHTML(opt.description)}</small>
            </span>
        </button>`;
    }).join('');
    menu.querySelectorAll('[data-reply-control]').forEach((item) => item.addEventListener('click', () => {
        const control = item.dataset.replyControl;
        setPostingReplyControl(container, control);
        closePostReplyControlMenu(container);
    }));
}

function togglePostReplyControlMenu(container) {
    const menu = container?.querySelector('.post-reply-control-menu');
    const button = container?.querySelector('.post-reply-control-button');
    if (!menu || !button) return;
    closePostGroupMenu(container);
    closePostAccountMenu(container);
    const willOpen = menu.classList.contains('hidden');
    if (willOpen) {
        renderPostReplyControlMenu(container);
        menu.classList.remove('hidden');
        button.setAttribute('aria-expanded', 'true');
        bindPostReplyControlMenuOutsideHandler(container);
    } else {
        closePostReplyControlMenu(container);
    }
}

function renderPostGroupMenuIcon(group) {
    const iconUrl = getGroupIconUrl(group);
    if (iconUrl) {
        return `<img src="${escapeHTML(iconUrl)}" alt="" class="post-group-menu-icon">`;
    }
    return `<span class="post-group-menu-icon post-group-menu-icon-fallback" aria-hidden="true">${ICONS.group}</span>`;
}

function renderNyaitterPostMenuIcon() {
    return '<img src="logo.png" alt="" class="post-group-menu-icon post-group-menu-nyaitter-logo">';
}

function getPostingGroup(container) {
    return container?._postingGroup || null;
}

function setPostingGroup(container, group = null, { locked = false } = {}) {
    if (!container) return;
    container._postingGroup = group;
    container._postGroupLocked = locked;
    const destinationButton = container.querySelector('.post-group-button');
    const lockButton = container.querySelector('.post-lock-button');
    const announcementButton = container.querySelector('.post-announcement-button');
    const groupName = group?.name || 'Nyaitter';
    if (destinationButton) {
        destinationButton.disabled = locked;
        destinationButton.title = locked
            ? `返信先グループ: ${groupName}`
            : `投稿先: ${groupName}`;
        destinationButton.setAttribute('aria-label', destinationButton.title);
        destinationButton.classList.toggle('active', Boolean(group));
    }
    if (lockButton) {
        lockButton.disabled = Boolean(group);
        lockButton.classList.toggle('hidden', Boolean(group));
        if (group) {
            lockButton.classList.remove('active');
            lockButton.setAttribute('aria-pressed', 'false');
        }
    }
    if (announcementButton) {
        const visible = group ? Boolean(group.canAnnounce) : Boolean(container?._postingAccount?.admin ?? getCurrentUser()?.admin);
        announcementButton.hidden = !visible;
        announcementButton.classList.toggle('hidden', !visible);
        announcementButton.title = group ? 'グループアナウンス' : 'Nyaitterアナウンス';
        announcementButton.setAttribute('aria-label', announcementButton.title);
        announcementButton.classList.remove('active');
        announcementButton.setAttribute('aria-pressed', 'false');
    }
}

function closePostGroupMenu(container) {
    const menu = container?.querySelector('.post-group-menu');
    const button = container?.querySelector('.post-group-button');
    menu?.classList.add('hidden');
    button?.setAttribute('aria-expanded', 'false');
    if (container?._postGroupMenuOutsideHandler) {
        document.removeEventListener('pointerdown', container._postGroupMenuOutsideHandler, true);
        container._postGroupMenuOutsideHandler = null;
    }
}

function bindPostGroupMenuOutsideHandler(container) {
    if (!container || container._postGroupMenuOutsideHandler) return;
    const handler = (event) => {
        const menu = container.querySelector('.post-group-menu');
        const button = container.querySelector('.post-group-button');
        if (!menu || menu.classList.contains('hidden') || menu.contains(event.target) || button?.contains(event.target)) return;
        closePostGroupMenu(container);
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    container._postGroupMenuOutsideHandler = handler;
    document.addEventListener('pointerdown', handler, true);
}

function getPostingGroupListPath(container) {
    const parameters = new URLSearchParams({ limit: '200' });
    const postingAccountId = getPostingAccountId(container);
    if (postingAccountId != null) parameters.set('post_as_user_id', String(postingAccountId));
    return `/server/api/groups/mine?${parameters.toString()}`;
}

async function getPostingAccountGroups(container) {
    const { data, error } = await apiRequest(getPostingGroupListPath(container));
    if (error) throw error;
    return Array.isArray(data?.groups) ? data.groups : [];
}

async function applyPostGroupSelection(container, groupId, { timelineSyncVersion = null, postingAccountVersion = null } = {}) {
    const requestedAccountVersion = postingAccountVersion ?? Number(container?._postingAccountVersion || 0);
    const parameters = new URLSearchParams();
    const postingAccountId = getPostingAccountId(container);
    if (postingAccountId != null) parameters.set('post_as_user_id', String(postingAccountId));
    const query = parameters.size ? `?${parameters.toString()}` : '';
    const { data, error } = await apiRequest(`/server/api/groups/${encodeURIComponent(groupId)}${query}`);
    if (error || !data?.group?.membership || data.group.membership.status !== 'active') {
        throw error || new Error('参加中のグループを確認できません。');
    }
    if (container?._postingAccountVersion !== requestedAccountVersion) return;
    if (timelineSyncVersion != null && container?._timelinePostingDestinationVersion !== timelineSyncVersion) return;
    const group = data.group;
    const role = (group.roles || []).find((candidate) => String(candidate.id) === String(group.membership.role_id));
    const permissions = role?.permissions || [];
    setPostingGroup(container, {
        id: group.id,
        name: group.name || 'グループ',
        canAnnounce: Number(group.owner_id) === Number(getPostingAccountId(container))
            || permissions.includes('admin')
            || permissions.includes('announce'),
    }, { locked: Boolean(container?._postGroupLocked) });
}

function renderPostGroupMenu(container, groups) {
    const menu = container?.querySelector('.post-group-menu');
    if (!menu) return;
    const nyaitterItem = `<button type="button" class="post-group-menu-item ${!getPostingGroup(container) ? 'active' : ''}" data-group-id="" aria-pressed="${String(!getPostingGroup(container))}">${renderNyaitterPostMenuIcon()}<span class="post-group-menu-copy"><strong>Nyaitter</strong><small>通常ポスト</small></span></button>`;
    const groupItems = groups.map((group) => {
        const selected = String(group.id) === String(getPostingGroup(container)?.id);
        return `<button type="button" class="post-group-menu-item ${selected ? 'active' : ''}" data-group-id="${escapeHTML(String(group.id))}" aria-pressed="${String(selected)}">${renderPostGroupMenuIcon(group)}<span class="post-group-menu-copy"><strong>${escapeHTML(group.name || '無題のグループ')}</strong><small>グループポスト</small></span></button>`;
    }).join('');
    menu.innerHTML = `${nyaitterItem}${groupItems || '<p class="post-group-menu-empty">参加中のグループはありません。</p>'}`;
    menu.querySelectorAll('[data-group-id]').forEach((item) => item.addEventListener('click', async () => {
        try {
            container._timelinePostingDestinationVersion = Number(container._timelinePostingDestinationVersion || 0) + 1;
            const groupId = item.dataset.groupId;
            if (groupId) await applyPostGroupSelection(container, groupId);
            else setPostingGroup(container, null);
            closePostGroupMenu(container);
        } catch (error) {
            showAppAlert(error.message || '投稿先グループを選択できませんでした。');
        }
    }));
}

async function syncPostGroupDestinationsForPostingAccount(container, postingAccountVersion) {
    if (!container || container._postGroupLocked) return;
    try {
        const groups = await getPostingAccountGroups(container);
        if (container._postingAccountVersion !== postingAccountVersion) return;
        container._postingAccountGroups = groups;
        const selectedGroup = getPostingGroup(container);
        if (selectedGroup && !groups.some((group) => String(group.id) === String(selectedGroup.id))) {
            setPostingGroup(container, null);
        } else if (selectedGroup) {
            try {
                await applyPostGroupSelection(container, selectedGroup.id, { postingAccountVersion });
            } catch (_) {
                if (container._postingAccountVersion === postingAccountVersion) setPostingGroup(container, null);
            }
        }
        if (!container.querySelector('.post-group-menu')?.classList.contains('hidden')) {
            renderPostGroupMenu(container, groups);
        }
    } catch (_) {
        const menu = container.querySelector('.post-group-menu');
        if (container._postingAccountVersion === postingAccountVersion && menu && !menu.classList.contains('hidden')) {
            menu.innerHTML = '<p class="post-group-menu-empty">グループ一覧を読み込めませんでした。</p>';
        }
    }
}

export function syncPostFormDestinationWithTimeline(container, groupId = null, groupName = '') {
    if (!container || container._postGroupLocked) return;
    const timelineSyncVersion = Number(container._timelinePostingDestinationVersion || 0) + 1;
    container._timelinePostingDestinationVersion = timelineSyncVersion;
    if (!groupId) {
        setPostingGroup(container, null);
        return;
    }

    const postingAccountVersion = Number(container._postingAccountVersion || 0);
    setPostingGroup(container, {
        id: String(groupId),
        name: groupName || 'グループ',
        canAnnounce: false,
    });
    void applyPostGroupSelection(container, groupId, { timelineSyncVersion, postingAccountVersion }).catch(() => {
        if (
            container._postingAccountVersion === postingAccountVersion
            && container._timelinePostingDestinationVersion === timelineSyncVersion
        ) {
            setPostingGroup(container, null);
        }
    });
}

async function openPostGroupMenu(container) {
    const menu = container?.querySelector('.post-group-menu');
    const button = container?.querySelector('.post-group-button');
    if (!menu || !button || container?._postGroupLocked) return;
    if (!menu.classList.contains('hidden')) {
        closePostGroupMenu(container);
        return;
    }
    const postingAccountVersion = Number(container._postingAccountVersion || 0);
    menu.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    bindPostGroupMenuOutsideHandler(container);
    menu.innerHTML = '<div class="post-group-menu-loading"><div class="spinner"></div></div>';
    try {
        const groups = await getPostingAccountGroups(container);
        if (container._postingAccountVersion !== postingAccountVersion || menu.classList.contains('hidden')) return;
        container._postingAccountGroups = groups;
        renderPostGroupMenu(container, groups);
    } catch (_) {
        if (container._postingAccountVersion === postingAccountVersion) {
            menu.innerHTML = '<p class="post-group-menu-empty">グループ一覧を読み込めませんでした。</p>';
        }
    }
}

export function handleCtrlEnter(e) {
    if (e.ctrlKey && e.key === 'Enter') {
        e.target
            .closest('.post-form')
            ?.querySelector('button[id^="post-submit-button"]')
            ?.click();
    }
}

export function attachPostFormListeners(container, onPostSuccess = null) {
    const currentUser = getCurrentUser();
    if (currentUser) setPostingAccount(container, currentUser);
    container.querySelector('.post-account-selector')?.addEventListener('click', () => {
        void openPostAccountMenu(container);
    });
    container.querySelector('.attachment-button')?.addEventListener('click', () => {
        container.querySelector('#file-input')?.click();
    });
    container.querySelector('#file-input')?.addEventListener('change', (e) => {
        handleFileSelection(e, container);
    });
    container.querySelector('.post-mask-button')?.addEventListener('click', () => {
        handlePostMask(container);
    });
    container.querySelector('.post-lock-button')?.addEventListener('click', () => {
        handlePostLock(container);
    });
    container.querySelector('.post-announcement-button')?.addEventListener('click', () => {
        handlePostAnnouncement(container);
    });
    container.querySelector('.post-group-button')?.addEventListener('click', () => {
        void openPostGroupMenu(container);
    });
    container.querySelector('.post-reply-control-button')?.addEventListener('click', () => {
        togglePostReplyControlMenu(container);
    });
    container.querySelector('#post-submit-button')?.addEventListener('click', () => {
        handlePostSubmit(container, onPostSuccess);
    });

    const editor = container.querySelector('#post-content');
    if (editor) {
        editor.addEventListener('keydown', handleCtrlEnter);
        editor.addEventListener('paste', (event) => {
            const imageFiles = Array.from(event.clipboardData?.items || [])
                .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                .map((item, index) => {
                    const file = item.getAsFile();
                    if (!file) return null;
                    if (file.name) return file;
                    const extension = item.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
                    return new File(
                        [file],
                        `pasted-image-${Date.now()}-${index}.${extension}`,
                        { type: item.type },
                    );
                })
                .filter(Boolean);

            if (imageFiles.length > 0) {
                void handleFileSelection(
                    { target: { files: imageFiles } },
                    container,
                    { append: true },
                );
            }
        });
        attachMarkdownContentEditor(editor);
        setupMarkdownEditorPreviewButton(container, editor);
    }

    const emojiButton = container.querySelector('.emoji-pic-button');
    if (emojiButton) {
        let pickerInstance = null;
        let pickerLoading = false;
        emojiButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            const existingPicker = container.querySelector('#emoji-picker');
            if (existingPicker && !existingPicker.classList.contains('hidden')) {
                existingPicker.classList.add('hidden');
                return;
            }
            if (existingPicker && pickerInstance) {
                existingPicker.classList.remove('hidden');
                return;
            }
            if (pickerLoading) return;
            pickerLoading = true;
            try {
                pickerInstance = await emoji_picker_create({
                    triggerButton: emojiButton,
                    onEmojiSelect: (emoji) => {
                        const targetEditor = container.querySelector('#post-content');
                        if (targetEditor) {
                            const val = emoji.native || `:${emoji.id}:`;
                            insertMarkdownEditorText(targetEditor, val);
                        }
                    },
                    onClickOutside: () => {
                        container.querySelector('#emoji-picker')?.classList.add('hidden');
                    },
                });
                const pickerPlaceholder = container.querySelector('#emoji-picker');
                if (pickerPlaceholder) {
                    pickerPlaceholder.replaceWith(pickerInstance);
                    pickerInstance.classList.remove('hidden');
                } else {
                    container.querySelector('.post-form-actions')?.appendChild(pickerInstance);
                }
            } catch (error) {
                console.error('絵文字ピッカーの初期化に失敗しました:', error);
            } finally {
                pickerLoading = false;
            }
        });
    }
}

export async function handleFileSelection(event, container, { append = false } = {}) {
    const previewContainer = container.querySelector('.file-preview-container');
    if (!previewContainer) return;
    previewContainer.innerHTML = '<div class="spinner" style="margin: 1rem;"></div>';

    const files = Array.from(event.target.files);
    const compressedFiles = [];

    for (const file of files) {
        try {
            const compressed = await compressImage(file);
            compressedFiles.push(compressed);
        } catch (error) {
            console.error('ファイル処理エラー:', error);
            compressedFiles.push(file);
        }
    }

    setSelectedFiles(
        append ? [...getSelectedFiles(), ...compressedFiles] : compressedFiles,
    );

    const fileInput = container.querySelector('#file-input');
    if (fileInput && typeof DataTransfer !== 'undefined') {
        const selectedFileList = new DataTransfer();
        getSelectedFiles().forEach((file) => selectedFileList.items.add(file));
        fileInput.files = selectedFileList.files;
    }

    previewContainer.innerHTML = '';
    getSelectedFiles().forEach((file, index) => {
        const previewItem = document.createElement('div');
        previewItem.className = 'file-preview-item';

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewItem.innerHTML = `<img src="${e.target.result}" alt="${escapeHTML(file.name)}"><button class="file-preview-remove" data-index="${index}">×</button>`;
                previewContainer.appendChild(previewItem);
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewItem.innerHTML = `<video src="${e.target.result}" controls></video><button class="file-preview-remove" data-index="${index}">×</button>`;
                previewContainer.appendChild(previewItem);
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('audio/')) {
            previewItem.innerHTML = `<span>${getEmoji('🎵')} ${getEmoji(escapeHTML(file.name))}</span><button class="file-preview-remove" data-index="${index}">×</button>`;
            previewContainer.appendChild(previewItem);
        } else {
            previewItem.innerHTML = `<span>${getEmoji('📄')} ${getEmoji(escapeHTML(file.name))}</span><button class="file-preview-remove" data-index="${index}">×</button>`;
            previewContainer.appendChild(previewItem);
        }
    });

    previewContainer.onclick = (e) => {
        if (e.target.classList.contains('file-preview-remove')) {
            const indexToRemove = parseInt(e.target.dataset.index, 10);
            getSelectedFiles().splice(indexToRemove, 1);
            handleFileSelection(
                { target: { files: new DataTransfer().files } },
                container,
            );
            const newFiles = new DataTransfer();
            getSelectedFiles().forEach((file) => newFiles.items.add(file));
            if (fileInput) fileInput.files = newFiles.files;
        }
    };
}

export function handlePostMask(container) {
    const button = container.querySelector('.post-mask-button');
    button?.classList.toggle('active');
}

export function handlePostLock(container) {
    const button = container.querySelector('.post-lock-button');
    if (!button) return;
    button.classList.toggle('active');
    button.setAttribute('aria-pressed', String(button.classList.contains('active')));
}

export function handlePostAnnouncement(container) {
    const button = container.querySelector('.post-announcement-button');
    if (!button) return;
    button.classList.toggle('active');
    button.setAttribute('aria-pressed', String(button.classList.contains('active')));
}

export async function handlePostSubmit(container, onPostSuccess = null) {
    if (!getCurrentUser()) return showAppAlert('ログインが必要です。');
    const postingAccountId = getPostingAccountId(container);
    if (!postingAccountId) return showAppAlert('投稿アカウントを確認できません。');
    const contentEl = container.querySelector('#post-content');
    const content = getMarkdownEditorValue(contentEl).trim();
    if (!content && getSelectedFiles().length === 0 && !getQuotingPost()) {
        return showAppAlert('内容を入力するか、ファイルを添付してください。');
    }

    const maskActive = container.querySelector('.post-mask-button')?.classList.contains('active') || false;
    const lockActive = container.querySelector('.post-lock-button')?.classList.contains('active') || false;
    const announcementActive = container.querySelector('.post-announcement-button')?.classList.contains('active') || false;
    const postingGroup = getPostingGroup(container);
    const groupAnnouncementActive = Boolean(postingGroup && announcementActive);
    if (postingGroup && getQuotingPost()) {
        return showAppAlert('引用・リポストはグループ投稿として送信できません。');
    }

    const button = container.querySelector('#post-submit-button');
    if (button) {
        button.disabled = true;
        button.textContent = '送信中...';
    }
    showLoading(true);

    let attachmentsData = [];
    let uploadedFileIds = [];

    try {
        for (const file of getSelectedFiles()) {
            const fileId = await uploadFileViaEdgeFunction(file, {
                asUserId: postingAccountId,
            });
            uploadedFileIds.push(fileId);
            const fileType = file.type.startsWith('image/')
                ? 'image'
                : file.type.startsWith('video/')
                  ? 'video'
                  : file.type.startsWith('audio/')
                    ? 'audio'
                    : 'file';
            attachmentsData.push({
                type: fileType,
                id: fileId,
                name: file.name,
            });
        }

        const { data: newPost, error: rpcError } = await api
            .rpc('create_post_new', {
                p_content: content,
                p_reply_id: getReplyingTo()?.id || null,
                p_repost_to: getQuotingPost()?.id || null,
                p_attachments: attachmentsData.length > 0 ? attachmentsData : null,
                p_mask: maskActive,
                p_lock: lockActive,
                p_announcement: Boolean(!postingGroup && announcementActive),
                p_group_id: postingGroup?.id || null,
                p_group_announcement: groupAnnouncementActive,
                p_reply_control: getPostingReplyControl(container),
                p_as_user_id: postingAccountId,
            })
            .single();

        if (rpcError) throw rpcError;

        const replyTargetId = getReplyingTo()?.id || null;
        invalidateTimelinePageCache();
        setSelectedFiles([]);
        setMarkdownEditorValue(contentEl, '');
        setPostingGroup(container, null);
        setPostingReplyControl(container, 'everyone');
        const previewContainer = container.querySelector('.file-preview-container');
        if (previewContainer) previewContainer.innerHTML = '';

        if (container.closest('.modal-overlay')) {
            closePostModal();
        }

        if (typeof onPostSuccess === 'function') {
            await onPostSuccess({ replyTargetId, newPost });
        } else if (replyTargetId) {
            window.location.hash = `#post/${replyTargetId}`;
        }
    } catch (e) {
        console.error('ポスト送信に失敗しました:', e);
        if (uploadedFileIds.length > 0) {
            await deleteFilesViaEdgeFunction(uploadedFileIds, {
                asUserId: postingAccountId,
            });
        }
        showAppAlert(`投稿に失敗しました: ${e.message || '不明なエラー'}`);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'ポスト';
        }
        showLoading(false);
    }
}

function renderQuotingPostPreview(container, quotingPost) {
    const previewContainer = container.querySelector('#quoting-preview-container');
    if (!previewContainer || !quotingPost) return;

    const author = quotingPost.author
        || quotingPost.user
        || getCachedUser(quotingPost.userid)
        || { name: '不明なユーザー' };
    const nestedPost = document.createElement('div');
    nestedPost.className = 'nested-repost-container quoting-post-preview';

    const header = document.createElement('div');
    header.className = 'post-header';
    const icon = document.createElement('img');
    icon.className = 'user-icon';
    icon.src = getUserIconUrl(author);
    icon.alt = `${author.name || '不明なユーザー'}のアイコン`;
    header.appendChild(icon);

    const authorName = document.createElement('span');
    authorName.className = 'post-author';
    authorName.innerHTML = getEmoji(escapeHTML(author.name || '不明なユーザー'));
    header.appendChild(authorName);
    nestedPost.appendChild(header);

    const content = document.createElement('div');
    content.className = 'post-content';
    content.innerHTML = renderNyarkDown(
        String(quotingPost.content || ''),
        new Map(),
        { allowMarkdown: true, allowContentDecorations: true },
    );
    nestedPost.appendChild(content);

    if (Array.isArray(quotingPost.attachments) && quotingPost.attachments.length > 0) {
        const attachmentInfo = document.createElement('div');
        attachmentInfo.className = 'attachment-fileinfo';
        attachmentInfo.textContent = `添付ファイル ${quotingPost.attachments.length}件`;
        nestedPost.appendChild(attachmentInfo);
    }

    previewContainer.replaceChildren(nestedPost);
}

export function openPostModal(replyTo = null, quotingPost = null) {
    setReplyingTo(replyTo);
    setQuotingPost(quotingPost);

    const postModal = DOM.postModal;
    const modalFormContainer = postModal?.querySelector('.post-form-container-modal');
    if (!postModal || !modalFormContainer) return;

    modalFormContainer.innerHTML = createPostFormHTML(true);
    attachPostFormListeners(modalFormContainer);

    if (replyTo) {
        const replyGroupId = replyTo?.groupId || replyTo?.group_id || null;
        if (replyGroupId) {
            setPostingGroup(modalFormContainer, {
                id: replyGroupId,
                name: replyTo?.group_name || 'グループ',
                canAnnounce: false,
            }, { locked: true });
            void applyPostGroupSelection(modalFormContainer, replyGroupId).catch(() => {});
        } else {
            setPostingGroup(modalFormContainer, null, { locked: true });
        }
        modalFormContainer.querySelector('.post-reply-control-button')?.classList.add('hidden');
    }

    if (replyTo?.isPrivate || replyTo?.lock) {
        const lockButton = modalFormContainer.querySelector('.post-lock-button');
        lockButton?.classList.add('active');
        lockButton?.setAttribute('aria-pressed', 'true');
    }

    const replyInfo = modalFormContainer.querySelector('#reply-info');
    if (replyTo && replyInfo) {
        replyInfo.innerHTML = `返信先: <strong>@${escapeHTML(replyTo.username || replyTo.name || '')}</strong>`;
        replyInfo.classList.remove('hidden');
    } else if (quotingPost && replyInfo) {
        replyInfo.textContent = '注意: 引用を返信代わりに使用する行為は推奨されていません。';
        replyInfo.classList.remove('hidden');
        renderQuotingPostPreview(modalFormContainer, quotingPost);
    } else if (replyInfo) {
        replyInfo.classList.add('hidden');
    }

    modalFormContainer.querySelector('.modal-close-btn')?.addEventListener('click', closePostModal);
    postModal.classList.remove('hidden');
    const postEditor = modalFormContainer.querySelector('#post-content');
    if (postEditor) {
        autoResizeMarkdownEditor(postEditor);
        postEditor.focus();
    }
}

export function closePostModal() {
    DOM.postModal?.classList.add('hidden');
    setReplyingTo(null);
    setQuotingPost(null);
}

export function openRepostModal(post, triggerButton) {
    closePostModal();
    const modalId = `repost-menu-${post.id}`;
    if (document.getElementById(modalId)) return;

    const menu = document.createElement('div');
    menu.id = modalId;
    menu.className = 'post-menu is-visible';

    const simpleRepostBtn = document.createElement('button');
    simpleRepostBtn.textContent = 'リポスト';
    simpleRepostBtn.onclick = (e) => {
        e.stopPropagation();
        handleSimpleRepost(post.id);
        menu.remove();
    };

    const quotePostBtn = document.createElement('button');
    quotePostBtn.textContent = '引用ポスト';
    quotePostBtn.onclick = (e) => {
        e.stopPropagation();
        openPostModal(null, post);
        menu.remove();
    };

    menu.appendChild(simpleRepostBtn);
    menu.appendChild(quotePostBtn);

    if (triggerButton) {
        document.body.appendChild(menu);
        const btnRect = triggerButton.getBoundingClientRect();
        menu.style.position = 'absolute';
        menu.style.top = `${window.scrollY + btnRect.top - menu.offsetHeight}px`;
        menu.style.left = `${window.scrollX + btnRect.left}px`;
        menu.style.right = 'auto';
    }

    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 0);
}

export async function handleSimpleRepost(postId, onComplete = null) {
    if (!getCurrentUser()) return showAppAlert('ログインが必要です。');
    showLoading(true);
    try {
        const { error: rpcError } = await api.rpc('create_post_new', {
            p_content: null,
            p_reply_id: null,
            p_repost_to: postId,
            p_attachments: null,
            p_mask: false,
        });

        if (rpcError) throw rpcError;

        invalidateTimelinePageCache();
        if (typeof onComplete === 'function') {
            await onComplete();
        }
    } catch (e) {
        console.error(e);
        const friendlyMessage = e.message.replace(/^Error: /, '');
        showAppAlert(`リポストに失敗しました: ${friendlyMessage}`);
    } finally {
        showLoading(false);
    }
}

export function updateFollowButtonState(button, isFollowing, isLock = false) {
    if (!button) return;
    button.classList.toggle('follow-button-following', isFollowing);
    button.classList.toggle('follow-button-not-following', !isFollowing);
    button.textContent = isFollowing ? 'フォロー中' : isLock ? 'フォロー申請' : 'フォロー';
}

export function applyOptimisticPostToggle(button, postId, { activeClass, accountField }) {
    const countSpan = button.querySelector('span:not(.icon)');
    const originalCount = Number.parseInt(countSpan?.textContent, 10);
    const wasActive = button.classList.contains(activeClass);
    const isActive = !wasActive;
    const currentUser = getCurrentUser();
    const originalIds = Array.isArray(currentUser?.[accountField])
        ? [...currentUser[accountField]]
        : [];
    const nextIds = new Set(originalIds.map(Number));
    if (isActive) nextIds.add(Number(postId));
    else nextIds.delete(Number(postId));

    button.classList.toggle(activeClass, isActive);
    if (countSpan && Number.isFinite(originalCount)) {
        countSpan.textContent = String(Math.max(0, originalCount + (isActive ? 1 : -1)));
    }
    if (currentUser) currentUser[accountField] = [...nextIds];

    return {
        isActive,
        restore() {
            button.classList.toggle(activeClass, wasActive);
            if (countSpan && Number.isFinite(originalCount)) {
                countSpan.textContent = String(originalCount);
            }
            if (currentUser) currentUser[accountField] = originalIds;
        },
        applyServerState(serverIsActive, serverIds, serverCount) {
            button.classList.toggle(activeClass, Boolean(serverIsActive));
            if (countSpan && Number.isFinite(Number(serverCount))) {
                countSpan.textContent = String(Math.max(0, Number(serverCount)));
            }
            if (currentUser && Array.isArray(serverIds)) currentUser[accountField] = serverIds;
        },
    };
}

export async function openEditPostModal(postId, onSaved = null) {
    showLoading(true);
    try {
        const { data: post, error } = await api
            .from('post')
            .select('content, mask, attachments, reply_id, replyTo, reply_to, reply_to_post, reply_control, replyControl, lock')
            .eq('id', postId)
            .single();
        if (error || !post) throw new Error('ポスト情報の取得に失敗しました。');

        const isReply = Boolean(post.reply_id || post.replyTo || post.reply_to || post.reply_to_post);
        let currentAttachments = post.attachments || [];
        let filesToDelete = new Set();
        let filesToAdd = [];

        const renderAttachments = () => {
            let existingHTML = '';
            currentAttachments.forEach((attachment) => {
                if (filesToDelete.has(attachment.id)) return;
                existingHTML += `
                    <div class="file-preview-item">
                        <span>${attachment.type === 'image' ? '🖼️' : '📎'} ${escapeHTML(attachment.name)}</span>
                        <button class="file-preview-remove" data-id="${escapeHTML(String(attachment.id))}" data-type="existing">×</button>
                    </div>`;
            });

            let newHTML = '';
            filesToAdd.forEach((file, index) => {
                newHTML += `
                    <div class="file-preview-item">
                        <span>${file.type.startsWith('image/') ? '🖼️' : '📎'} ${escapeHTML(file.name)}</span>
                        <button class="file-preview-remove" data-index="${index}" data-type="new">×</button>
                    </div>`;
            });
            return existingHTML + newHTML;
        };

        const updatePreview = () => {
            const container = DOM.editPostModalContent.querySelector('.file-preview-container');
            if (container) container.innerHTML = renderAttachments();
        };

        DOM.editPostModalContent.innerHTML = `
            <div class="post-form" style="padding: 1rem;">
                <img src="${getUserIconUrl(getCurrentUser())}" class="user-icon" alt="your icon">
                <button class="modal-close-btn">×</button>
                <div class="form-content">
                    <div class="markdown-textarea-editor post-form-textarea"><textarea id="edit-post-textarea" class="markdown-content-editor" rows="5" spellcheck="true" data-markdown-content-editor data-server-input-limit="post_content_length">${escapeHTML(String(post.content || ''))}</textarea><div class="markdown-editor-paint" aria-hidden="true"><div class="markdown-editor-placeholder"></div><div class="markdown-editor-preview hidden"></div><div class="markdown-editor-selection"></div><div class="markdown-editor-composition"></div><div class="markdown-editor-caret"></div></div></div>
                    <div class="file-preview-container" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem;">${renderAttachments()}</div>
                    <div class="post-form-actions" style="padding-top: 1rem;">
                        <button type="button" class="attachment-button float-left" title="ファイルを追加">${ICONS.attachment}</button>
                        <button type="button" class="emoji-pic-button float-left" title="絵文字を選択">${ICONS.emoji}</button>
                        <input type="file" id="edit-file-input" class="hidden" multiple>
                        <div id="emoji-picker" class="hidden"></div>
                        <div class="post-reply-control-menu hidden" role="menu"></div>
                        <button id="update-post-button" style="padding: 0.5rem 1.5rem; border-radius: 9999px; border: none; background-color: var(--primary-color); color: white; font-weight: 700; margin-left: auto;" class="float-right">保存</button>
                        ${!isReply ? `<button type="button" class="post-reply-control-button float-right" title="返信可能なユーザー: 誰でも" aria-label="返信可能なユーザー: 誰でも" aria-haspopup="menu" aria-expanded="false">${ICONS.reply_control}</button>` : ''}
                        <button type="button" class="post-mask-button float-right ${post.mask ? 'active' : ''}" title="ワンクッション">${ICONS.mask}</button>
                        <button type="button" class="post-lock-button float-right ${post.lock ? 'active' : ''}" title="プライベート" aria-pressed="${post.lock ? 'true' : 'false'}">${ICONS.lock}</button>
                        <span class="float-clear"></span>
                    </div>
                </div>
            </div>
        `;

        setPostingReplyControl(DOM.editPostModalContent, post.reply_control || post.replyControl || 'everyone');
        const editEmojiBtn = DOM.editPostModalContent.querySelector('.emoji-pic-button');
        if (editEmojiBtn) {
            let editPickerInstance = null;
            let editPickerLoading = false;
            editEmojiBtn.addEventListener('click', async (event) => {
                event.stopPropagation();
                const existingPicker = DOM.editPostModalContent.querySelector('#emoji-picker');
                if (existingPicker && !existingPicker.classList.contains('hidden')) {
                    existingPicker.classList.add('hidden');
                    return;
                }
                if (existingPicker && editPickerInstance) {
                    existingPicker.classList.remove('hidden');
                    return;
                }
                if (editPickerLoading) return;
                editPickerLoading = true;
                try {
                    editPickerInstance = await emoji_picker_create({
                        triggerButton: editEmojiBtn,
                        onEmojiSelect: (emoji) => {
                            const targetEditor = DOM.editPostModalContent.querySelector('#edit-post-textarea');
                            if (targetEditor) {
                                const val = emoji.native || `:${emoji.id}:`;
                                insertMarkdownEditorText(targetEditor, val);
                            }
                        },
                        onClickOutside: () => {
                            DOM.editPostModalContent.querySelector('#emoji-picker')?.classList.add('hidden');
                        },
                    });
                    const pickerPlaceholder = DOM.editPostModalContent.querySelector('#emoji-picker');
                    if (pickerPlaceholder) {
                        pickerPlaceholder.replaceWith(editPickerInstance);
                        editPickerInstance.classList.remove('hidden');
                    } else {
                        DOM.editPostModalContent.querySelector('.post-form-actions')?.appendChild(editPickerInstance);
                    }
                } catch (error) {
                    console.error('絵文字ピッカーの初期化に失敗しました:', error);
                } finally {
                    editPickerLoading = false;
                }
            });
        }
        const editPostEditor = DOM.editPostModalContent.querySelector('#edit-post-textarea');
        attachMarkdownContentEditor(editPostEditor);
        setupMarkdownEditorPreviewButton(DOM.editPostModalContent, editPostEditor);
        DOM.editPostModalContent.querySelector('.post-reply-control-button')?.addEventListener('click', () => {
            togglePostReplyControlMenu(DOM.editPostModalContent);
        });
        DOM.editPostModalContent.querySelector('.post-mask-button')?.addEventListener('click', () => {
            handlePostMask(DOM.editPostModalContent);
        });
        DOM.editPostModalContent.querySelector('.post-lock-button')?.addEventListener('click', () => {
            handlePostLock(DOM.editPostModalContent);
        });

        DOM.editPostModal.querySelector('#update-post-button').onclick = () =>
            handleUpdatePost(postId, currentAttachments, filesToAdd, Array.from(filesToDelete), onSaved);
        DOM.editPostModal.querySelector('.modal-close-btn').onclick = () =>
            DOM.editPostModal.classList.add('hidden');

        DOM.editPostModal.querySelector('.attachment-button').onclick = () => {
            DOM.editPostModal.querySelector('#edit-file-input').click();
        };

        DOM.editPostModal.querySelector('#edit-file-input').onchange = (e) => {
            const files = Array.from(e.target.files);
            filesToAdd.push(...files);
            updatePreview();
        };

        DOM.editPostModalContent.querySelector('.file-preview-container').onclick = (e) => {
            if (e.target.classList.contains('file-preview-remove')) {
                const type = e.target.dataset.type;
                if (type === 'existing') {
                    filesToDelete.add(e.target.dataset.id);
                } else if (type === 'new') {
                    filesToAdd.splice(parseInt(e.target.dataset.index, 10), 1);
                }
                updatePreview();
            }
        };

        DOM.editPostModal.classList.remove('hidden');
        if (editPostEditor) {
            autoResizeMarkdownEditor(editPostEditor);
            editPostEditor.focus();
        }
    } catch (error) {
        console.error(error);
        showAppAlert(error.message || '編集モーダルの読み込みに失敗しました');
    } finally {
        showLoading(false);
    }
}

export async function handleUpdatePost(postId, originalAttachments, filesToAdd, filesToDeleteIds, onSaved = null) {
    const newContent = getMarkdownEditorValue(
        DOM.editPostModal.querySelector('#edit-post-textarea'),
    ).trim();
    const maskActive = DOM.editPostModal.querySelector('.post-mask-button')?.classList.contains('active') || false;
    const lockActive = DOM.editPostModal.querySelector('.post-lock-button')?.classList.contains('active') || false;
    const replyControlValue = getPostingReplyControl(DOM.editPostModalContent);

    if (!newContent) return showAppAlert('内容を入力するか、ファイルを添付してください。');

    const button = DOM.editPostModal.querySelector('#update-post-button');
    if (button) {
        button.disabled = true;
        button.textContent = '保存中...';
    }
    showLoading(true);

    try {
        if (filesToDeleteIds.length > 0) {
            await deleteFilesViaEdgeFunction(filesToDeleteIds);
        }

        let newUploadedAttachments = [];
        if (filesToAdd.length > 0) {
            for (const file of filesToAdd) {
                const fileId = await uploadFileViaEdgeFunction(file);
                const fileType = file.type.startsWith('image/')
                    ? 'image'
                    : file.type.startsWith('video/')
                      ? 'video'
                      : file.type.startsWith('audio/')
                        ? 'audio'
                        : 'file';
                newUploadedAttachments.push({
                    type: fileType,
                    id: fileId,
                    name: file.name,
                });
            }
        }

        let finalAttachments = originalAttachments.filter(
            (att) => !filesToDeleteIds.includes(att.id),
        );
        finalAttachments.push(...newUploadedAttachments);

        const { error: postUpdateError } = await api
            .from('post')
            .update({
                content: newContent,
                attachments: finalAttachments,
                mask: maskActive,
                lock: lockActive,
                reply_control: replyControlValue,
            })
            .eq('id', postId);

        if (postUpdateError) throw postUpdateError;

        DOM.editPostModal.classList.add('hidden');
        invalidateTimelinePageCache();
        if (typeof onSaved === 'function') {
            await onSaved();
        }
    } catch (e) {
        console.error(e);
        showAppAlert('ポストの更新に失敗しました。');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '保存';
        }
        showLoading(false);
    }
}

export async function copyPost(postId, button) {
    const customBase = globalThis.NyaitterClientConfig?.postShareUrl;
    let postUrl;
    if (customBase) {
        const cleanBase = String(customBase).trim().replace(/\/+$/, '');
        postUrl = cleanBase.includes('#')
            ? `${cleanBase}/#post/${postId}`
            : `${cleanBase}/posts/${postId}`;
    } else {
        postUrl = `${window.location.origin}${window.location.pathname}#post/${postId}`;
    }
    await copyTextToClipboard(postUrl);
    if (button) {
        button.innerText = `コピーしました!`;
    }
}

export async function pinPost(postId) {
    let cmessage, emessage;

    if (!getCurrentUser()) return showAppAlert('ログインが必要です。');
    if (!isPinnedPost(postId)) {
        cmessage = 'このポストをピン留めしますか?';
        emessage = 'ポストのピン留め';
    } else {
        cmessage = 'このポストのピン留めを解除しますか?';
        emessage = 'ポストのピン留めの解除';
    }
    if (!(await showAppConfirm(cmessage))) return;
    showLoading(true);
    try {
        const { data: pinId, error: fetchError } = await api.rpc('handle_pin', { p_post_id: postId });
        if (fetchError) throw new Error(`ポストのピン留め処理に失敗: ${fetchError.message}`);
        const normalizedPinId = normalizePostId(pinId);
        getCurrentUser().pin = normalizedPinId;
        const currentUserId = Number(getCurrentUser().id);
        if (Number.isInteger(currentUserId)) {
            getPublicProfileCache().delete(currentUserId);
            invalidateProfileTabPageCache(currentUserId, 'posts');
        }
        invalidateTimelinePageCache();
        await router();
    } catch (e) {
        console.error(e);
        showAppAlert(`${emessage}に失敗しました。`);
    } finally {
        showLoading(false);
    }
}

export function removePostFromTimeline(postId) {
    const normalizedPostId = Number(postId);
    if (!Number.isInteger(normalizedPostId) || normalizedPostId <= 0) return;

    document
        .querySelectorAll(`.post[data-post-id="${normalizedPostId}"]`)
        .forEach((postElement) => postElement.remove());
}

export async function deletePost(postId) {
    if (!getCurrentUser()) return showAppAlert('ログインが必要です。');
    if (!(await showAppConfirm('このポストを削除しますか?'))) return;
    showLoading(true);
    try {
        const currentUser = getCurrentUser();
        if (currentUser?.admin) {
            const { error: adminDeleteError } = await apiRequest(
                `/server/api/posts/admin/${encodeURIComponent(String(postId))}`,
                { method: 'DELETE' },
            );
            if (adminDeleteError) throw adminDeleteError;
        } else {
            const { error: deleteError } = await api
                .from('post')
                .delete()
                .eq('id', postId);
            if (deleteError) throw deleteError;
        }

        invalidateTimelinePageCache();
        removePostFromTimeline(postId);
    } catch (e) {
        console.error(e);
        showAppAlert('削除に失敗しました。');
    } finally {
        showLoading(false);
    }
}

export function handleReplyClick(postId, username, isPrivate = false) {
    if (!getCurrentUser()) return showAppAlert('ログインが必要です。');
    openPostModal({ id: postId, name: username, isPrivate });
}

export async function handleLike(button, postId) {
    if (!getCurrentUser() || button.disabled) return;
    const optimistic = applyOptimisticPostToggle(button, postId, {
        activeClass: 'liked',
        accountField: 'like',
    });
    button.disabled = true;

    try {
        const { data, error } = await api.rpc('handle_like', { p_post_id: postId });
        if (error) throw error;

        optimistic.applyServerState(data.liked, data.updated_likes, data.count);
        invalidateTimelinePageCache();
    } catch (e) {
        optimistic.restore();
        console.error('いいね更新エラー:', e);
        showAppAlert('いいねの更新に失敗しました。');
    } finally {
        button.disabled = false;
    }
}

export async function handleStar(button, postId) {
    if (!getCurrentUser() || button.disabled) return;
    const optimistic = applyOptimisticPostToggle(button, postId, {
        activeClass: 'starred',
        accountField: 'star',
    });
    button.disabled = true;

    try {
        const { data, error } = await api.rpc('handle_star', { p_post_id: postId });
        if (error) throw error;

        optimistic.applyServerState(data.starred, data.updated_stars, data.count);
        invalidateTimelinePageCache();
    } catch (e) {
        optimistic.restore();
        console.error('お気に入り更新エラー:', e);
        showAppAlert('お気に入りの更新に失敗しました。');
    } finally {
        button.disabled = false;
    }
}

export function handleShowMaskedPost(button) {
    button.disabled = true;
    const postMain = button.parentElement;
    const postMaskTitle = postMain.querySelector('.post-mask-title');

    if (postMaskTitle) postMaskTitle.remove();
    button.remove();

    const postContent = postMain.querySelector('.post-content');
    const postAttach = postMain.querySelector('.attachments-container');

    if (postAttach) postAttach.classList.remove('hidden');
    if (postContent) postContent.classList.remove('hidden');
}

export async function handleFollowToggle(targetUserId, button, isLock = false) {
    if (!getCurrentUser() || button.disabled) return;

    const currentUser = getCurrentUser();
    const originalFollows = Array.isArray(currentUser.follow) ? [...currentUser.follow] : [];
    const wasFollowing = button.classList.contains('follow-button-following');
    const optimisticFollowing = !wasFollowing;
    const followerCountSpan = document.querySelector('#follower-count strong');
    const originalFollowerCount = Number.parseInt(followerCountSpan?.textContent, 10);

    button.disabled = true;
    updateFollowButtonState(button, optimisticFollowing, isLock);

    const nextFollows = new Set(originalFollows.map(Number));
    if (optimisticFollowing) nextFollows.add(Number(targetUserId));
    else nextFollows.delete(Number(targetUserId));
    currentUser.follow = [...nextFollows];

    if (followerCountSpan && Number.isFinite(originalFollowerCount)) {
        followerCountSpan.textContent = String(Math.max(0, originalFollowerCount + (optimisticFollowing ? 1 : -1)));
    }

    try {
        const { data, error } = await api.rpc('handle_follow', { p_target_user_id: targetUserId });
        if (error) throw error;

        const serverFollowing = Boolean(data?.following);
        updateFollowButtonState(button, serverFollowing, isLock);
        if (Array.isArray(data?.updated_follows)) {
            currentUser.follow = data.updated_follows;
        }
        if (followerCountSpan && Number.isFinite(Number(data?.follower_count))) {
            followerCountSpan.textContent = String(data.follower_count);
        }
        invalidateTimelinePageCache();
    } catch (e) {
        updateFollowButtonState(button, wasFollowing, isLock);
        currentUser.follow = originalFollows;
        if (followerCountSpan && Number.isFinite(originalFollowerCount)) {
            followerCountSpan.textContent = String(originalFollowerCount);
        }
        console.error('フォロー切り替えエラー:', e);
        showAppAlert('フォロー状態の更新に失敗しました。');
    }
}

export async function handleDislikePost(postId, menu = null) {
    if (!getCurrentUser()) return showAppAlert('ログインが必要です。');
    menu?.classList.remove('is-visible');
    try {
        const { data, error } = await apiRequest(`/server/api/posts/${encodeURIComponent(String(postId))}/dislike`, {
            method: 'POST',
        });
        if (error) throw error;
    } catch (e) {
        console.error('Dislike error:', e);
    }
}

export async function handleFollowMenuToggle(author, menu = null) {
    const currentUser = getCurrentUser();
    if (!currentUser || !author?.id) return showAppAlert('ログインが必要です。');
    menu?.classList.remove('is-visible');
    const targetUserId = Number(author.id);
    const isFollowing = Array.isArray(currentUser.follow) && currentUser.follow.some((id) => Number(id) === targetUserId);
    const originalFollows = Array.isArray(currentUser.follow) ? [...currentUser.follow] : [];

    const nextFollows = new Set(originalFollows.map(Number));
    if (!isFollowing) nextFollows.add(targetUserId);
    else nextFollows.delete(targetUserId);
    currentUser.follow = [...nextFollows];

    try {
        const { data, error } = await api.rpc('handle_follow', { p_target_user_id: targetUserId });
        if (error) throw error;
        if (Array.isArray(data?.updated_follows)) {
            currentUser.follow = data.updated_follows;
        }
        invalidateTimelinePageCache();
    } catch (e) {
        currentUser.follow = originalFollows;
        console.error('フォロー切り替えエラー:', e);
        showAppAlert('フォロー状態の更新に失敗しました。');
    }
}

export async function handleBlockMenuToggle(author, menu = null) {
    const currentUser = getCurrentUser();
    if (!currentUser || !author?.id) return showAppAlert('ログインが必要です。');
    menu?.classList.remove('is-visible');
    const targetUserId = Number(author.id);
    const isBlocked = Array.isArray(currentUser.block) && currentUser.block.some((id) => Number(id) === targetUserId);

    if (!isBlocked) {
        if (!(await showAppConfirm(`@${author.name || 'ユーザー'} をブロックしますか？\nブロックすると、このユーザーのポストは表示されなくなります。`))) {
            return;
        }
    }

    const originalBlock = Array.isArray(currentUser.block) ? [...currentUser.block] : [];
    const updatedBlock = isBlocked
        ? originalBlock.filter((id) => Number(id) !== targetUserId)
        : [...originalBlock, targetUserId];

    try {
        const { error } = await apiRequest('/server/api/users/me', {
            method: 'PATCH',
            body: { block: updatedBlock },
        });
        if (error) throw error;
        currentUser.block = updatedBlock;
        invalidateTimelinePageCache();
        showAppAlert(isBlocked ? `@${author.name || 'ユーザー'} のブロックを解除しました。` : `@${author.name || 'ユーザー'} をブロックしました。`);
        if (!isBlocked) {
            document.querySelectorAll('.post[data-action-target-id]').forEach((el) => {
                if (Number(el._nyaitterPost?.userid || el._nyaitterPost?.userId) === targetUserId) {
                    el.style.opacity = '0.3';
                }
            });
        }
    } catch (e) {
        console.error('ブロック切り替えエラー:', e);
        showAppAlert('ブロック状態の更新に失敗しました。');
    }
}

export function openReplyControlModal(post, onUpdated = null) {
    const existing = document.getElementById('reply-control-modal');
    if (existing) existing.remove();

    const currentControl = post.reply_control || post.replyControl || 'everyone';
    const modal = document.createElement('div');
    modal.id = 'reply-control-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 440px; padding: 1.25rem;">
            <button type="button" class="modal-close-btn" aria-label="閉じる">×</button>
            <div style="margin-bottom: 1rem;">
                <h3 style="margin: 0 0 0.4rem 0; font-size: 1.15rem;">返信可能なユーザーの変更</h3>
                <p style="margin: 0; font-size: 0.85rem; color: var(--secondary-text-color);">
                    このポストに返信できるユーザーを選択してください。条件を満たさなくなった既存の返信は自動的に削除されます。
                </p>
            </div>
            <div class="reply-control-modal-options" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem;">
                ${REPLY_CONTROL_OPTIONS.map((opt) => `
                    <button type="button" class="post-reply-control-menu-item ${opt.id === currentControl ? 'active' : ''}" data-control="${opt.id}" style="padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 10px; width: 100%; text-align: left;">
                        <span class="post-reply-control-menu-icon" aria-hidden="true" style="margin-right: 0.5rem;">${opt.icon}</span>
                        <span class="post-reply-control-menu-copy">
                            <strong>${escapeHTML(opt.title)}</strong>
                            <small>${escapeHTML(opt.description)}</small>
                        </span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    modal.querySelectorAll('[data-control]').forEach((item) => {
        item.addEventListener('click', async () => {
            const nextControl = item.dataset.control;
            if (nextControl === currentControl) {
                closeModal();
                return;
            }
            item.disabled = true;
            try {
                const { error } = await api
                    .from('post')
                    .update({
                        content: post.content,
                        attachments: post.attachments,
                        mask: post.mask,
                        lock: post.lock,
                        reply_control: nextControl,
                    })
                    .eq('id', post.id);
                if (error) throw error;
                post.reply_control = nextControl;
                post.replyControl = nextControl;
                invalidateTimelinePageCache();
                closeModal();
                showAppAlert('返信可能なユーザーを変更しました。');
                if (typeof onUpdated === 'function') {
                    await onUpdated(nextControl);
                }
            } catch (err) {
                console.error(err);
                showAppAlert('返信設定の更新に失敗しました。');
                item.disabled = false;
            }
        });
    });
}

// Bind to window for backwards compatibility if needed
window.copyPost = copyPost;
window.pinPost = pinPost;
window.deletePost = deletePost;
window.handleReplyClick = handleReplyClick;
window.handleLike = handleLike;
window.handleStar = handleStar;
window.handleShowMaskedPost = handleShowMaskedPost;
window.handleFollowToggle = handleFollowToggle;
window.handleDislikePost = handleDislikePost;
window.handleFollowMenuToggle = handleFollowMenuToggle;
window.handleBlockMenuToggle = handleBlockMenuToggle;
window.openReplyControlModal = openReplyControlModal;
