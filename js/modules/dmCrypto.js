import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    getDmE2EPublicKeyCache,
    setDmE2EPublicKeyCache,
    getDmE2ERegisteredUsers,
    setDmE2ERegisteredUsers,
} from '../state.js';

export function supportsDmE2E() {
    return (
        typeof window.crypto?.subtle?.generateKey === 'function' &&
        typeof window.crypto?.subtle?.deriveKey === 'function' &&
        typeof window.crypto?.subtle?.encrypt === 'function' &&
        typeof window.crypto?.subtle?.decrypt === 'function'
    );
}

export function dmE2EBytesToBase64url(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

export function dmE2EBase64urlToBytes(base64url) {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(pad);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export async function dmE2EExportPublicKey(publicKey) {
    const spki = await window.crypto.subtle.exportKey('spki', publicKey);
    return dmE2EBytesToBase64url(new Uint8Array(spki));
}

export async function dmE2EImportPublicKey(base64url) {
    const bytes = dmE2EBase64urlToBytes(base64url);
    return window.crypto.subtle.importKey(
        'spki',
        bytes.buffer,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        [],
    );
}

export async function dmE2EGenerateKeyPair() {
    return window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        ['deriveKey', 'deriveBits'],
    );
}

const DM_E2E_KEY_STORAGE_PREFIX = 'nyaitter_dm_e2e_key_';
const memoryKeyPairs = new Map();

export async function dmE2ELoadStoredKey(userId) {
    if (!supportsDmE2E()) return null;
    const normalizedUserId = Number(userId);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId < 0)
        return null;

    if (memoryKeyPairs.has(normalizedUserId)) {
        return memoryKeyPairs.get(normalizedUserId);
    }

    const keyPair = await dmE2EGenerateKeyPair();
    memoryKeyPairs.set(normalizedUserId, keyPair);
    return keyPair;
}

export async function dmE2EEnsureKeyPairRegistered(userId) {
    if (!supportsDmE2E()) return null;
    const keyPair = await dmE2ELoadStoredKey(userId);
    if (!keyPair) return null;

    let registeredUsers = getDmE2ERegisteredUsers();
    if (!registeredUsers) {
        registeredUsers = new Set();
        setDmE2ERegisteredUsers(registeredUsers);
    }
    if (registeredUsers.has(userId)) return keyPair;

    try {
        const pubKeyBase64url = await dmE2EExportPublicKey(keyPair.publicKey);
        const { error } = await apiRequest('/server/api/dm/e2e/public-key', {
            method: 'PUT',
            body: { public_key: pubKeyBase64url },
        });
        if (!error) {
            registeredUsers.add(userId);
            getDmE2EPublicKeyCache().set(userId, keyPair.publicKey);
        }
    } catch (_) {}
    return keyPair;
}

export async function dmE2EGetPublicKeys(memberUserIds) {
    const cache = getDmE2EPublicKeyCache();
    const missingIds = memberUserIds.filter((id) => !cache.has(id));

    if (missingIds.length > 0) {
        try {
            const { data } = await apiRequest(
                `/server/api/dm/e2e/public-keys?user_ids=${missingIds.join(',')}`,
            );
            if (data?.keys && typeof data.keys === 'object') {
                for (const [userIdStr, pubKeyBase64url] of Object.entries(data.keys)) {
                    const uid = Number(userIdStr);
                    if (pubKeyBase64url) {
                        try {
                            const cryptoKey = await dmE2EImportPublicKey(pubKeyBase64url);
                            cache.set(uid, cryptoKey);
                        } catch (_) {
                            cache.set(uid, null);
                        }
                    } else {
                        cache.set(uid, null);
                    }
                }
            }
        } catch (_) {}
    }

    const result = new Map();
    for (const uid of memberUserIds) {
        result.set(uid, cache.get(uid) || null);
    }
    return result;
}

export async function dmE2EDeriveAesKey(privateKey, peerPublicKey) {
    return window.crypto.subtle.deriveKey(
        { name: 'ECDH', public: peerPublicKey },
        privateKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

export async function dmE2EEncryptContent(plaintext, memberUserIds) {
    if (!supportsDmE2E()) return null;
    const currentUser = getCurrentUser();
    if (!currentUser) return null;

    const myKeyPair = await dmE2EEnsureKeyPairRegistered(currentUser.id);
    if (!myKeyPair) return null;

    const allMemberIds = Array.from(
        new Set([...memberUserIds, currentUser.id]),
    );
    const publicKeys = await dmE2EGetPublicKeys(allMemberIds);

    for (const uid of allMemberIds) {
        if (!publicKeys.get(uid)) {
            return null;
        }
    }

    const messageKey = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
    );
    const rawMessageKey = await window.crypto.subtle.exportKey(
        'raw',
        messageKey,
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedPlaintext = new TextEncoder().encode(plaintext);
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        messageKey,
        encodedPlaintext,
    );

    const myPubKeyBase64url = await dmE2EExportPublicKey(myKeyPair.publicKey);
    const encryptedKeys = {};
    for (const uid of allMemberIds) {
        const peerPubKey = publicKeys.get(uid);
        const derivedKey = await dmE2EDeriveAesKey(myKeyPair.privateKey, peerPubKey);
        const keyIv = window.crypto.getRandomValues(new Uint8Array(12));
        const encKeyBuf = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: keyIv },
            derivedKey,
            rawMessageKey,
        );
        encryptedKeys[String(uid)] = {
            iv: dmE2EBytesToBase64url(keyIv),
            key: dmE2EBytesToBase64url(new Uint8Array(encKeyBuf)),
        };
    }

    return {
        v: 1,
        sender_pub: myPubKeyBase64url,
        iv: dmE2EBytesToBase64url(iv),
        ciphertext: dmE2EBytesToBase64url(new Uint8Array(ciphertextBuffer)),
        keys: encryptedKeys,
    };
}

export async function dmE2EDecryptMessage(message, currentUserId) {
    if (!supportsDmE2E()) return null;
    if (!message || typeof message !== 'object') return null;
    if (message.e2e !== true || !message.e2e_payload) return null;

    const payload = message.e2e_payload;
    if (payload.v !== 1 || !payload.sender_pub || !payload.ciphertext || !payload.iv || !payload.keys) {
        return null;
    }

    const myKeyEntry = payload.keys[String(currentUserId)];
    if (!myKeyEntry || !myKeyEntry.iv || !myKeyEntry.key) return null;

    try {
        const myKeyPair = await dmE2ELoadStoredKey(currentUserId);
        if (!myKeyPair) return null;

        const senderPubKey = await dmE2EImportPublicKey(payload.sender_pub);
        const derivedKey = await dmE2EDeriveAesKey(myKeyPair.privateKey, senderPubKey);

        const keyIv = dmE2EBase64urlToBytes(myKeyEntry.iv);
        const encKeyBytes = dmE2EBase64urlToBytes(myKeyEntry.key);
        const rawMessageKeyBuf = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: keyIv },
            derivedKey,
            encKeyBytes.buffer,
        );

        const messageKey = await window.crypto.subtle.importKey(
            'raw',
            rawMessageKeyBuf,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt'],
        );

        const msgIv = dmE2EBase64urlToBytes(payload.iv);
        const ciphertextBytes = dmE2EBase64urlToBytes(payload.ciphertext);
        const plaintextBuf = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: msgIv },
            messageKey,
            ciphertextBytes.buffer,
        );

        return new TextDecoder().decode(plaintextBuf);
    } catch (_) {
        return null;
    }
}
