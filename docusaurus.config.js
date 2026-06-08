// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Sachin's Notebook",
  tagline: 'Notes, tutorials, and references on AI, tooling, and software engineering.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://indulge.github.io',
  baseUrl: '/sachin-notebook/',

  organizationName: 'indulge',
  projectName: 'sachin-notebook',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: ['./plugins/notebook-snapshot'],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: 'read',
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/indulge/sachin-notebook/tree/main/',
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: "Sachin's Notebook",
        items: [],
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
