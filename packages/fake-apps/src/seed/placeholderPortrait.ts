import { crc32, deflateSync } from "node:zlib";

/**
 * A made-up portrait as a 96×96 PNG, the size Google gives thumbnails: a plain head-and-shoulders
 * shape, with colours picked by `index`, so each person's differs and none is a real face.
 */
export function placeholderPortrait(index: number): Buffer {
  const [background, figure] = PALETTE[index % PALETTE.length]!;
  const rows = Array.from({ length: SIZE }, (_, y) => {
    // Each row starts with its filter type, 0 for none.
    const row = Buffer.alloc(1 + SIZE * BYTES_PER_PIXEL);
    for (let x = 0; x < SIZE; x++) {
      row.write(isFigure(x, y) ? figure : background, 1 + x * BYTES_PER_PIXEL, "hex");
    }
    return row;
  });
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header()),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const SIZE = 96;
const BYTES_PER_PIXEL = 3;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Background and figure colours, as hex RGB, one pair per named person. */
const PALETTE: [string, string][] = [
  ["d9e8fb", "4a78b8"],
  ["fbe3d4", "c06a3c"],
  ["ddf2e3", "3f8f5e"],
  ["efe0f7", "8652a8"],
  ["faf0cc", "a88622"],
  ["d6f1f1", "2f8688"],
  ["f8dce2", "b04a63"],
  ["e4e7ec", "556070"],
  ["e8f4d2", "6b8e2a"],
  ["fde7c8", "b8741a"],
  ["dce0fa", "555fb8"],
];

/** A round head above rounded shoulders, centred. */
function isFigure(x: number, y: number): boolean {
  const head = (x - 48) ** 2 + (y - 38) ** 2 <= 17 ** 2;
  const shoulders = ((x - 48) / 34) ** 2 + ((y - 96) / 32) ** 2 <= 1;
  return head || shoulders;
}

/** Width, height, 8 bits per channel, RGB, default compression and filter, no interlacing. */
function header(): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(SIZE, 0);
  data.writeUInt32BE(SIZE, 4);
  data.set([8, 2, 0, 0, 0], 8);
  return data;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}
