module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-empty": [0, "always"],
    "subject-empty": [0, "always"],
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "wip", // Work in progress (for checkpoints)
        "docs", // Documentation only changes
        "style", // Changes that don't affect code meaning
        "refactor", // Code change that neither fixes bug nor adds feature
        "perf", // Performance improvement
        "test", // Adding missing tests or correcting existing tests
        "build", // Changes that affect build system or dependencies
        "ci", // Changes to CI configuration files and scripts
        "chore", // Other changes that don't modify src or test files
        "revert", // Reverts a previous commit
      ],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "extension", // Chrome extension main app
        "db", // Database package
        "extractor", // Content extractor package
        "providers", // LLM providers package
        "ui", // UI components
        "deps", // Dependencies
        "config", // Configuration files
        "ci", // CI/CD related
        "docs", // Documentation
      ],
    ],
    "subject-case": [2, "always", "lower-case"],
    "subject-full-stop": [2, "never", "."],
    "body-max-line-length": [2, "always", 100],
    "header-max-length": [2, "always", 72],
  },
};