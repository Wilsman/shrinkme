declare module "gifsicle-wasm-browser" {
  type GifsicleInput = {
    file: string | Blob | File | ArrayBuffer;
    name: string;
  };

  type GifsicleOptions = {
    input: GifsicleInput[];
    command: string[];
    folder?: string[];
    isStrict?: boolean;
  };

  const gifsicle: {
    run(options: GifsicleOptions): Promise<File[] | null>;
  };

  export default gifsicle;
}
