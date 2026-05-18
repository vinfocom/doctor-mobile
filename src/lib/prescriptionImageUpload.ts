import * as ImagePicker from 'expo-image-picker';
import type { PrescriptionUploadFile } from '../api/prescriptions';
import { prepareUploadFile } from './uploadFilePreparation';

export const PRESCRIPTION_MAX_PAGE_COUNT = 5;
export const PRESCRIPTION_COMPRESSION_QUALITY = 0.82;

type PickerResult =
    | { ok: true; files: PrescriptionUploadFile[] }
    | { ok: false; error: string };

const toPrescriptionUploadFile = async (
    asset: ImagePicker.ImagePickerAsset,
    index: number
): Promise<PrescriptionUploadFile> => {
    const file = await prepareUploadFile(asset, {
        fallbackBaseName: `prescription_${Date.now()}_${index + 1}`,
        fallbackMimeType: 'image/jpeg',
        optimizeImage: true,
        maxLongEdgePx: 1600,
        jpegQuality: 0.72,
    });

    return {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
    };
};

const normalizePickedAssets = async (assets: ImagePicker.ImagePickerAsset[]) =>
    Promise.all(assets.map((asset, index) => toPrescriptionUploadFile(asset, index)));

export const appendPrescriptionUploadFiles = (
    existingFiles: PrescriptionUploadFile[],
    nextFiles: PrescriptionUploadFile[]
) => [...existingFiles, ...nextFiles].slice(0, PRESCRIPTION_MAX_PAGE_COUNT);

export const pickPrescriptionImagesFromCamera = async (): Promise<PickerResult> => {
    try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            return {
                ok: false,
                error: 'Please allow camera access to upload a prescription image.',
            };
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: PRESCRIPTION_COMPRESSION_QUALITY,
            allowsEditing: false,
            exif: false,
        });

        if (result.canceled || !result.assets?.length) {
            return { ok: true, files: [] };
        }

        return {
            ok: true,
            files: await normalizePickedAssets(result.assets.slice(0, 1)),
        };
    } catch (error: any) {
        return {
            ok: false,
            error:
                typeof error?.message === 'string' && error.message.trim().length > 0
                    ? error.message
                    : 'Unable to open the camera right now. Please try again.',
        };
    }
};

export const pickPrescriptionImagesFromLibrary = async (
    remainingSlots: number
): Promise<PickerResult> => {
    try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            return {
                ok: false,
                error: 'Please allow photo library access to upload prescription images.',
            };
        }

        if (remainingSlots <= 0) {
            return {
                ok: false,
                error: `You can upload up to ${PRESCRIPTION_MAX_PAGE_COUNT} prescription pages at a time.`,
            };
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: PRESCRIPTION_COMPRESSION_QUALITY,
            allowsEditing: false,
            allowsMultipleSelection: true,
            selectionLimit: remainingSlots,
            exif: false,
        });

        if (result.canceled || !result.assets?.length) {
            return { ok: true, files: [] };
        }

        return {
            ok: true,
            files: await normalizePickedAssets(result.assets.slice(0, remainingSlots)),
        };
    } catch (error: any) {
        return {
            ok: false,
            error:
                typeof error?.message === 'string' && error.message.trim().length > 0
                    ? error.message
                    : 'Unable to prepare the selected image right now. Please try again.',
        };
    }
};
