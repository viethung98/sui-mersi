/** @type {import('@mysten/codegen').SuiCodegenConfig} */
const config = {
  output: "./src/generated",
  importExtension: ".js",
  generateSummaries: false,
  packages: [
    {
      path: "./contracts",
      package: "cart",
      generate: {
        functions: true,
        types: false,
      },
    },
  ],
};

export default config;
