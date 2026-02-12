declare module "gifenc" {
  interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number;
        transparent?: boolean;
        dispose?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  }

  function GIFEncoder(): GIFEncoderInstance;

  function quantize(
    rgba: Uint8Array,
    maxColors: number,
    options?: { format?: string; oneBitAlpha?: boolean | number },
  ): number[][];

  function applyPalette(
    rgba: Uint8Array,
    palette: number[][],
    format?: string,
  ): Uint8Array;

  const gifenc: {
    GIFEncoder: typeof GIFEncoder;
    quantize: typeof quantize;
    applyPalette: typeof applyPalette;
  };

  export default gifenc;
}
