import * as FileSystem from 'expo-file-system';
import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export type PreparedUploadFile = {
    uri: string;
    name: string;
    mimeType: string;
};

type RawUploadAsset = {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    type?: string | null;
    name?: string | null;
};

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'application/pdf': '.pdf',
};

const getExtensionFromName = (name: string) => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === name.length - 1) {
        return '';
    }
    return name.slice(lastDot);
};

const sanitizeBaseName = (name: string) =>
    name
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);

const inferExtension = (name: string, mimeType: string) => {
    const fromName = getExtensionFromName(name);
    if (fromName) {
        return fromName;
    }
    return MIME_TYPE_TO_EXTENSION[mimeType] || '';
};

const normalizeFileName = (asset: RawUploadAsset, fallbackBaseName: string, mimeType: string) => {
    const candidate = asset.fileName || asset.name || fallbackBaseName;
    const extension = inferExtension(candidate, mimeType);
    const baseName = sanitizeBaseName(candidate.replace(/\.[^.]+$/, '') || fallbackBaseName);
    return `${baseName}${extension}`;
};

const buildCacheFileUri = (fileName: string) => {
    const cacheDirectory = FileSystem.cacheDirectory;
    if (!cacheDirectory) {
        throw new Error('App cache directory is unavailable.');
    }
    return `${cacheDirectory}uploads/${Date.now()}_${Math.random().toString(36).slice(2)}_${fileName}`;
};

export const prepareUploadFile = async (
    asset: RawUploadAsset,
    options?: {
        fallbackBaseName?: string;
        fallbackMimeType?: string;
        optimizeImage?: boolean;
        maxLongEdgePx?: number;
        jpegQuality?: number;
    }
): Promise<PreparedUploadFile> => {
    if (!asset?.uri) {
        throw new Error('Selected file is missing a valid URI.');
    }

    const mimeType = asset.mimeType || asset.type || options?.fallbackMimeType || 'application/octet-stream';
    const fileName = normalizeFileName(
        asset,
        options?.fallbackBaseName || 'upload',
        mimeType
    );

    let preparedUri = asset.uri;

    if (asset.uri.startsWith('content://')) {
        const uploadCacheDirectory = `${FileSystem.cacheDirectory}uploads`;
        const directoryInfo = await FileSystem.getInfoAsync(uploadCacheDirectory);
        if (!directoryInfo.exists) {
            await FileSystem.makeDirectoryAsync(uploadCacheDirectory, { intermediates: true });
        }

        const targetUri = buildCacheFileUri(fileName);
        await FileSystem.copyAsync({
            from: asset.uri,
            to: targetUri,
        });
        preparedUri = targetUri;
    }

    if (options?.optimizeImage && mimeType.startsWith('image/')) {
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
            Image.getSize(
                preparedUri,
                (width, height) => resolve({ width, height }),
                reject
            );
        });

        const maxLongEdgePx = options.maxLongEdgePx || 1600;
        const longEdge = Math.max(dimensions.width, dimensions.height);
        const shouldResize = longEdge > maxLongEdgePx;
        const resizeAction = shouldResize
            ? dimensions.width >= dimensions.height
                ? [{ resize: { width: maxLongEdgePx } }]
                : [{ resize: { height: maxLongEdgePx } }]
            : [];

        const manipulated = await manipulateAsync(preparedUri, resizeAction, {
            compress: options.jpegQuality ?? 0.72,
            format: SaveFormat.JPEG,
        });

        return {
            uri: manipulated.uri,
            name: `${fileName.replace(/\.[^.]+$/, '')}.jpg`,
            mimeType: 'image/jpeg',
        };
    }

    return {
        uri: preparedUri,
        name: fileName,
        mimeType,
    };
};
