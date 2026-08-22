import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../src/lib/errors/error-codes.js';

// cloudinary est mocké : on teste la logique de validation et le câblage
// du stream d'upload, PAS l'intégration réelle avec leurs serveurs.
const uploadStreamMock = vi.fn();
const configMock = vi.fn();
vi.mock('cloudinary', () => ({
  v2: {
    config: configMock,
    uploader: {
      upload_stream: uploadStreamMock,
    },
  },
}));

process.env.STORAGE_CLOUD_NAME = 'test-cloud';
process.env.STORAGE_API_KEY = 'test-key';
process.env.STORAGE_API_SECRET = 'test-secret';

const { UploadsService } = await import('../src/modules/uploads/uploads.service.js');

function makeUploadStreamRespond(response: object) {
  uploadStreamMock.mockImplementation((_options, callback) => ({
    end(_buffer: Buffer) {
      callback(null, response);
    },
  }));
}

describe('UploadsService.uploadImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a valid JPEG buffer and returns the secure URL + publicId', async () => {
    makeUploadStreamRespond({
      secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/listings/abc.jpg',
      public_id: 'listings/abc',
      bytes: 1024,
    });

    const result = await UploadsService.uploadImage({
      buffer: Buffer.from('fake-jpeg-bytes'),
      contentType: 'image/jpeg',
    });

    expect(result.url).toContain('https://res.cloudinary.com');
    expect(result.publicId).toBe('listings/abc');
    expect(configMock).toHaveBeenCalledWith(
      expect.objectContaining({ cloud_name: 'test-cloud', secure: true }),
    );
    expect(uploadStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'listings', resource_type: 'image' }),
      expect.any(Function),
    );
  });

  it('rejects a non-image mime type BEFORE calling Cloudinary', async () => {
    await expect(
      UploadsService.uploadImage({ buffer: Buffer.from('x'), contentType: 'application/pdf' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    expect(uploadStreamMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized image BEFORE calling Cloudinary', async () => {
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 Mo > limite 5 Mo
    await expect(
      UploadsService.uploadImage({ buffer: bigBuffer, contentType: 'image/png' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    expect(uploadStreamMock).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    await expect(
      UploadsService.uploadImage({ buffer: Buffer.alloc(0), contentType: 'image/png' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('wraps Cloudinary failures in a 502 INTERNAL_ERROR', async () => {
    uploadStreamMock.mockImplementation(() => ({
      end() {
        /* le stream ne répond jamais — simulé via rejet ci-dessous */
      },
    }));
    // Simule une erreur remontée par le callback Cloudinary
    uploadStreamMock.mockImplementation((_options, callback) => ({
      end() {
        callback(new Error('cloudinary down'), undefined);
      },
    }));

    await expect(
      UploadsService.uploadImage({ buffer: Buffer.from('x'), contentType: 'image/webp' }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
