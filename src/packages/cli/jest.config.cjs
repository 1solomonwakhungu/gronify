/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  // Sources import siblings with the .js extension that NodeNext requires; map them back to the .ts files.
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  // Modern ts-jest configuration
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          target: "es2020",
        },
      },
    ],
  },
};
