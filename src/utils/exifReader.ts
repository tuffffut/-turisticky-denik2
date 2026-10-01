/**
 * Client-side EXIF parser for extracting photo creation timestamps and location.
 * Zero external dependencies. Reads directly from JPEG/TIFF binary stream.
 * Gracefully falls back to File.lastModified for PNG/HEIC/WebP.
 */

export interface ParsedPhotoInfo {
  file: File;
  id: string;
  name: string;
  sizeBytes: number;
  captureDate: Date;
  dateString: string; // YYYY-MM-DD
  timeString: string; // HH:MM:SS
  source: 'exif' | 'fileModified';
  thumbnailUrl?: string;
  matchedHikeId?: string;
  matchedHikeTitle?: string;
  matchedConfidence?: 'exact_date' | 'close_date' | 'manual' | 'unmatched';
}

function parseExifDateString(str: string): Date | null {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str.trim();
  // Standard EXIF format: "YYYY:MM:DD HH:MM:SS" or ISO "YYYY-MM-DD HH:MM:SS"
  const match = cleaned.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    const dt = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
    if (!isNaN(dt.getTime())) {
      return dt;
    }
  }
  return null;
}

function readString(view: DataView, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trim();
}

function readSubIFD(
  view: DataView,
  tiffStart: number,
  ifdStart: number,
  littleEndian: boolean
): { dateTimeOriginal?: string } {
  const result: { dateTimeOriginal?: string } = {};
  if (ifdStart + 2 > view.byteLength) return result;
  const numEntries = view.getUint16(ifdStart, littleEndian);
  let offset = ifdStart + 2;

  for (let i = 0; i < numEntries; i++) {
    if (offset + 12 > view.byteLength) break;
    const tag = view.getUint16(offset, littleEndian);
    const type = view.getUint16(offset + 2, littleEndian);
    const count = view.getUint32(offset + 4, littleEndian);
    let valOffset = offset + 8;
    if (count > 4 || type === 2) {
      const ptr = view.getUint32(offset + 8, littleEndian);
      valOffset = tiffStart + ptr;
    }

    // 0x9003 = DateTimeOriginal
    if (tag === 0x9003 && type === 2) {
      result.dateTimeOriginal = readString(view, valOffset, count);
    }
    // 0x9004 = DateTimeDigitized fallback
    if (tag === 0x9004 && type === 2 && !result.dateTimeOriginal) {
      result.dateTimeOriginal = readString(view, valOffset, count);
    }
    offset += 12;
  }
  return result;
}

function readIFD(
  view: DataView,
  tiffStart: number,
  ifdStart: number,
  littleEndian: boolean
): { dateTime?: string; dateTimeOriginal?: string } {
  let result: { dateTime?: string; dateTimeOriginal?: string } = {};
  if (ifdStart + 2 > view.byteLength) return result;
  const numEntries = view.getUint16(ifdStart, littleEndian);
  let offset = ifdStart + 2;

  for (let i = 0; i < numEntries; i++) {
    if (offset + 12 > view.byteLength) break;
    const tag = view.getUint16(offset, littleEndian);
    const type = view.getUint16(offset + 2, littleEndian);
    const count = view.getUint32(offset + 4, littleEndian);
    let valOffset = offset + 8;
    if (count > 4 || type === 2) {
      const ptr = view.getUint32(offset + 8, littleEndian);
      valOffset = tiffStart + ptr;
    }

    // 0x0132 = DateTime
    if (tag === 0x0132 && type === 2) {
      result.dateTime = readString(view, valOffset, count);
    }
    // 0x8769 = ExifIFDPointer
    if (tag === 0x8769) {
      const subPtr = view.getUint32(offset + 8, littleEndian);
      const subResult = readSubIFD(view, tiffStart, tiffStart + subPtr, littleEndian);
      result = { ...result, ...subResult };
    }
    offset += 12;
  }
  return result;
}

function extractExifFromBuffer(buffer: ArrayBuffer): Date | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) {
    return null;
  }

  let offset = 2;
  const length = view.byteLength;

  while (offset + 4 < length) {
    const marker = view.getUint16(offset);
    offset += 2;

    if (marker === 0xFFE1) {
      const segLength = view.getUint16(offset);
      offset += 2;

      // Check "Exif\0\0"
      if (
        offset + 6 < length &&
        view.getUint8(offset) === 0x45 &&
        view.getUint8(offset + 1) === 0x78 &&
        view.getUint8(offset + 2) === 0x69 &&
        view.getUint8(offset + 3) === 0x66 &&
        view.getUint8(offset + 4) === 0x00 &&
        view.getUint8(offset + 5) === 0x00
      ) {
        const tiffStart = offset + 6;
        if (tiffStart + 8 > length) return null;
        const endianTag = view.getUint16(tiffStart);
        const littleEndian = endianTag === 0x4949; // "II"
        if (!littleEndian && endianTag !== 0x4D4D) return null; // "MM"
        const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
        if (firstIfdOffset < 8) return null;

        const tags = readIFD(view, tiffStart, tiffStart + firstIfdOffset, littleEndian);
        const rawDate = tags.dateTimeOriginal || tags.dateTime;
        if (rawDate) {
          return parseExifDateString(rawDate);
        }
      }
      offset += segLength - 2;
    } else if ((marker & 0xFF00) === 0xFF00) {
      if (marker === 0xFFDA || marker === 0xFFD9) break;
      const segLength = view.getUint16(offset);
      offset += segLength;
    } else {
      break;
    }
  }

  return null;
}

/**
 * Extracts photo metadata (capture date/time, source) from File
 */
export async function parsePhotoFile(file: File): Promise<ParsedPhotoInfo> {
  const fileId = `${file.name}-${file.size}-${Math.random().toString(36).substring(2, 7)}`;
  let captureDate: Date | null = null;
  let source: 'exif' | 'fileModified' = 'fileModified';

  // 1. Try reading the first 128KB for EXIF
  try {
    const slice = file.slice(0, 131072);
    const buffer = await slice.arrayBuffer();
    captureDate = extractExifFromBuffer(buffer);
    if (captureDate) {
      source = 'exif';
    }
  } catch (err) {
    console.debug('EXIF read error, falling back to file timestamp:', err);
  }

  // 2. Fallback to file.lastModified
  if (!captureDate) {
    if (file.lastModified && file.lastModified > 0) {
      captureDate = new Date(file.lastModified);
    } else {
      captureDate = new Date();
    }
    source = 'fileModified';
  }

  // Generate ISO date YYYY-MM-DD
  const y = captureDate.getFullYear();
  const m = String(captureDate.getMonth() + 1).padStart(2, '0');
  const d = String(captureDate.getDate()).padStart(2, '0');
  const dateString = `${y}-${m}-${d}`;

  // Time string HH:MM:SS
  const hh = String(captureDate.getHours()).padStart(2, '0');
  const mm = String(captureDate.getMinutes()).padStart(2, '0');
  const ss = String(captureDate.getSeconds()).padStart(2, '0');
  const timeString = `${hh}:${mm}:${ss}`;

  // Create lightweight preview URL for UI
  let thumbnailUrl: string | undefined = undefined;
  try {
    thumbnailUrl = URL.createObjectURL(file);
  } catch (e) {
    // ignore
  }

  return {
    file,
    id: fileId,
    name: file.name,
    sizeBytes: file.size,
    captureDate,
    dateString,
    timeString,
    source,
    thumbnailUrl,
  };
}
