/* eslint-disable @typescript-eslint/triple-slash-reference */
// Pulls in the ambient module declarations for Docusaurus aliases (`@theme/*`,
// `@docusaurus/*`, `@generated/*`, `*.module.css`, …) so the TypeScript layer
// can `import` them with real types. theme-classic transitively references
// module-type-aliases and the content plugins.
/// <reference types="@docusaurus/module-type-aliases" />
/// <reference types="@docusaurus/theme-classic" />
