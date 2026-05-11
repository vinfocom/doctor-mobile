import * as ImagePicker from 'expo-image-picker';
import type { PrescriptionUploadFile } from '../api/prescriptions';

export const PRESCRIPTION_MAX_PAGE_COUNT = 5;
export const PRESCRIPTION_COMPRESSION_QUALITY = 0.82;

type PickerResult =
    | { ok: true; files: PrescriptionUploadFile[] }
    | { ok: false; error: string };

const toPrescriptionUploadFile = (
    asset: ImagePicker.ImagePickerAsset,
    index: number
): PrescriptionUploadFile => ({
    uri: asset.uri,
    name: asset.fileName || `prescription_${Date.now()}_${index + 1}.jpg`,
    type: asset.mimeType || 'image/jpeg',
});

const normalizePickedAssets = (assets: ImagePicker.ImagePickerAsset[]) =>
    assets.map((asset, index) => toPrescriptionUploadFile(asset, index));

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
            files: normalizePickedAssets(result.assets.slice(0, 1)),
        };
    } catch {
        return {
            ok: false,
            error: 'Image preparation failed before upload. Please try again.',
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
            files: normalizePickedAssets(result.assets.slice(0, remainingSlots)),
        };
    } catch {
        return {
            ok: false,
            error: 'Image preparation failed before upload. Please try again.',
        };
    }
};
