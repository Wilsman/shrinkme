/* Runs gifsicle (WASM) jobs off the main thread.
 *
 * The WASM module is compiled once per worker. Each job gets a fresh instance
 * because gifsicle's CLI entry point keeps global state between runs.
 * Input bytes are cached by key so repeated attempts on the same GIF don't
 * re-read the file.
 */
importScripts("vendor/gifsicle/gifsicle.js");

let compiledModulePromise = null;
const inputCache = new Map();

const getCompiledModule = () => {
  if (!compiledModulePromise) {
    compiledModulePromise = WebAssembly.compileStreaming(
      fetch("vendor/gifsicle/gifsicle.wasm")
    ).catch((error) => {
      compiledModulePromise = null;
      throw error;
    });
  }
  return compiledModulePromise;
};

const getInputBytes = async (key, file) => {
  let bytes = inputCache.get(key);
  if (!bytes) {
    bytes = new Uint8Array(await file.arrayBuffer());
    inputCache.clear();
    inputCache.set(key, bytes);
  }
  return bytes;
};

const runGifsicle = async ({ inputKey, file, args }) => {
  const [compiled, inputBytes] = await Promise.all([
    getCompiledModule(),
    getInputBytes(inputKey, file),
  ]);

  const stderr = [];
  const mod = await createGifsicle({
    print: () => {},
    printErr: (line) => stderr.push(line),
    instantiateWasm: (imports, onSuccess) => {
      WebAssembly.instantiate(compiled, imports).then((instance) =>
        onSuccess(instance, compiled)
      );
      return {};
    },
  });

  mod.FS.writeFile("/input.gif", inputBytes);

  const argv = ["gifsicle", ...args, "-o", "/output.gif", "/input.gif"];
  const argvPtr = mod._malloc((argv.length + 1) * 4);
  argv.forEach((arg, index) => {
    mod.setValue(argvPtr + index * 4, mod.stringToNewUTF8(arg), "i32");
  });
  mod.setValue(argvPtr + argv.length * 4, 0, "i32");

  let exitCode;
  try {
    exitCode = mod._run_gifsicle(argv.length, argvPtr);
  } catch (error) {
    if (error && error.name === "ExitStatus") {
      exitCode = error.status;
    } else {
      throw error;
    }
  }

  // gifsicle writes warnings (e.g. "huge GIF, conserving memory") to stderr.
  // Only a non-zero exit code or a missing output file is a failure.
  let output = null;
  try {
    output = mod.FS.readFile("/output.gif");
  } catch {
    output = null;
  }

  if (exitCode !== 0 || !output || output.length === 0) {
    const message = stderr.filter((line) => !/warning:/i.test(line)).join("\n");
    throw new Error(message || `gifsicle exited with code ${exitCode}`);
  }

  return { output, stderr };
};

self.onmessage = async (event) => {
  const { id, type } = event.data;

  if (type === "warmup") {
    getCompiledModule().catch(() => {});
    return;
  }

  try {
    const { output, stderr } = await runGifsicle(event.data);
    self.postMessage({ id, ok: true, output, stderr }, [output.buffer]);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
