# Vendored: WebLLM

- Package: `@mlc-ai/web-llm` 0.2.87 (https://github.com/mlc-ai/web-llm), Apache-2.0 (see LICENSE)
- File: `web-llm.js` is the package's `lib/index.js` ES module, unmodified except the trailing sourceMappingURL comment was removed.
- sha256 of web-llm.js: `a4c380efe1e61c1ab823e8e4043e720e2fc4af4b23ae2b404d56d5fc8685e585`
- Purpose: runs a small language model in the browser via WebGPU for the optional "On this device" devil's advocate.
- It is loaded only when the user presses Download in Settings. Model files come from huggingface.co/mlc-ai and the model runtime from raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs, and are cached by the browser.
- To update: `npm pack @mlc-ai/web-llm@<version>`, copy lib/index.js over web-llm.js, update this file, and run the tests.
