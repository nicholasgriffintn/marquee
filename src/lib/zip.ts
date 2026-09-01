const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const END_MINIMUM_SIZE = 22;
const END_SEARCH_LIMIT = 65_557;
const ENTRY_LIMIT = 256;

export type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
};

function endOffset(view: DataView) {
  const first = Math.max(0, view.byteLength - END_SEARCH_LIMIT);

  for (let offset = view.byteLength - END_MINIMUM_SIZE; offset >= first; offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}

export function readZipEntries(data: ArrayBuffer) {
  const view = new DataView(data);
  const end = endOffset(view);

  if (end < 0) {
    throw new Error("That is not a valid ZIP archive.");
  }

  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  if (count > ENTRY_LIMIT) {
    throw new Error(`That ZIP contains more than ${ENTRY_LIMIT} files.`);
  }

  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error("That ZIP directory is incomplete.");
    }

    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameEnd = offset + 46 + nameLength;

    if (flags & 1 || nameEnd > view.byteLength) {
      throw new Error("Encrypted or incomplete ZIP files are not supported.");
    }

    if (
      localOffset + 30 > view.byteLength ||
      view.getUint32(localOffset, true) !== LOCAL_SIGNATURE
    ) {
      throw new Error("That ZIP contains an invalid file entry.");
    }

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;

    if (dataOffset + compressedSize > view.byteLength) {
      throw new Error("That ZIP contains a truncated file.");
    }

    entries.push({
      name: decoder.decode(new Uint8Array(data, offset + 46, nameLength)),
      compression,
      compressedSize,
      uncompressedSize,
      dataOffset,
    });
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

async function readBounded(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- bounded streaming enforces the inflated size limit
    const result = await reader.read();

    if (result.done) {
      break;
    }

    size += result.value.byteLength;

    if (size > limit) {
      void reader.cancel();
      throw new Error("A file inside that ZIP is too large.");
    }

    chunks.push(result.value);
  }

  const output = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

export async function readZipEntry(data: ArrayBuffer, entry: ZipEntry, limit: number) {
  if (entry.uncompressedSize > limit) {
    throw new Error("A file inside that ZIP is too large.");
  }

  const compressed = new Uint8Array(data, entry.dataOffset, entry.compressedSize);

  if (entry.compression === 0) {
    return compressed.slice();
  }

  if (entry.compression !== 8) {
    throw new Error("That ZIP uses an unsupported compression format.");
  }

  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));

  return readBounded(stream, limit);
}
