#!/usr/bin/env node

/**
 * Package Manager Check Script
 * Ensures only Bun is used for this project
 */

const packageManager = process.env.npm_execpath || process.env.npm_config_user_agent || '';

if (!packageManager) {
  console.log('ℹ️  No package manager context detected (running directly)');
  console.log('✅ This script will work when called by npm/bun install');
  process.exit(0);
}

const isBun = packageManager.includes('bun');
const isNpm = packageManager.includes('npm');
const isPnpm = packageManager.includes('pnpm');
const isYarn = packageManager.includes('yarn');

if (isBun) {
  console.log('✅ Using Bun - All good!');
  process.exit(0);
}

console.error('\n🚫 Package Manager Restriction');
console.error('This project requires Bun as the package manager.');
console.error('\nDetected package manager:', packageManager);

if (isNpm) {
  console.error('\n❌ npm detected');
  console.error('Please use: bun install');
} else if (isPnpm) {
  console.error('\n❌ pnpm detected');
  console.error('Please use: bun install');
} else if (isYarn) {
  console.error('\n❌ yarn detected');
  console.error('Please use: bun install');
} else {
  console.error('\n❌ Unknown package manager detected');
  console.error('Please use: bun install');
}

console.error('\n📦 Install Bun:');
console.error('curl -fsSL https://bun.sh/install | bash');
console.error('\n🚀 Then run:');
console.error('bun install');

process.exit(1);
