export default {
  scripts: {
    install: ["npm", "install"],
    "desktop:dev": ["bun", "electrobun/src/bun/dev.ts"],
    "desktop:electrobun": ["npx", "electrobun", "dev"],
    "desktop:build": ["npx", "electrobun", "build", "--env=stable"],
    sync: ["npx", "electrobun", "sync"],
  },
};
