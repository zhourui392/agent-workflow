/**
 * 全局配置读写功能测试
 *
 * @author zhourui(V33215020)
 * @since 2026/03/11
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_CONFIG_DIR = path.join(__dirname, 'test-global-config');

function setupTestConfigDir() {
  if (fs.existsSync(TEST_CONFIG_DIR)) {
    fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
  }

  const dirs = [
    TEST_CONFIG_DIR,
    path.join(TEST_CONFIG_DIR, 'rules'),
    path.join(TEST_CONFIG_DIR, 'mcp'),
    path.join(TEST_CONFIG_DIR, 'skills')
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log('✓ Test config directory created');
}

function testSystemPromptReadWrite() {
  const systemPromptPath = path.join(TEST_CONFIG_DIR, 'rules', 'system.md');

  const testPrompt = '# System Rules\n\nYou are a helpful assistant.';
  fs.writeFileSync(systemPromptPath, testPrompt, 'utf-8');
  console.log('✓ System prompt written');

  const readPrompt = fs.readFileSync(systemPromptPath, 'utf-8').trim();
  if (readPrompt !== testPrompt) {
    throw new Error('System prompt read/write mismatch');
  }
  console.log('✓ System prompt read correctly');
}

function testMcpServersConfig() {
  const mcpPath = path.join(TEST_CONFIG_DIR, 'mcp', 'servers.yaml');

  const testConfig = {
    'filesystem': {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: { DEBUG: 'true' }
    },
    'github': {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: 'test-token' }
    }
  };

  fs.writeFileSync(mcpPath, yaml.stringify(testConfig), 'utf-8');
  console.log('✓ MCP servers config written');

  const readContent = fs.readFileSync(mcpPath, 'utf-8');
  const readConfig = yaml.parse(readContent);

  if (!readConfig.filesystem || readConfig.filesystem.command !== 'npx') {
    throw new Error('MCP config read/write mismatch');
  }
  if (Object.keys(readConfig).length !== 2) {
    throw new Error('MCP config server count mismatch');
  }
  console.log('✓ MCP servers config read correctly');
}

function testSettingsConfig() {
  const settingsPath = path.join(TEST_CONFIG_DIR, 'settings.yaml');

  const testSettings = {
    default_model: 'claude-sonnet-4-20250514',
    allowed_tools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep']
  };

  fs.writeFileSync(settingsPath, yaml.stringify(testSettings), 'utf-8');
  console.log('✓ Settings config written');

  const readSettings = yaml.parse(fs.readFileSync(settingsPath, 'utf-8'));

  if (readSettings.default_model !== testSettings.default_model) {
    throw new Error('Settings model mismatch');
  }
  if (!Array.isArray(readSettings.allowed_tools) || readSettings.allowed_tools.length !== 6) {
    throw new Error('Settings allowed_tools mismatch');
  }
  console.log('✓ Settings config read correctly');
}

function testSkillsConfig() {
  const skillsDir = path.join(TEST_CONFIG_DIR, 'skills');

  const skills = {
    'code-review': '# Code Review Skill\n\nReview code for best practices.',
    'documentation': '# Documentation Skill\n\nGenerate documentation.'
  };

  for (const [name, content] of Object.entries(skills)) {
    fs.writeFileSync(path.join(skillsDir, `${name}.md`), content, 'utf-8');
  }
  console.log('✓ Skills files written');

  const skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  if (skillFiles.length !== 2) {
    throw new Error('Skills file count mismatch');
  }

  const loadedSkills: Record<string, string> = {};
  for (const file of skillFiles) {
    const skillName = path.basename(file, '.md');
    loadedSkills[skillName] = fs.readFileSync(path.join(skillsDir, file), 'utf-8').trim();
  }

  if (!loadedSkills['code-review'] || !loadedSkills['code-review'].includes('Code Review')) {
    throw new Error('Skills content mismatch');
  }
  console.log('✓ Skills files read correctly');
}

function testLoadGlobalConfig() {
  interface GlobalConfig {
    systemPrompt?: string;
    defaultModel?: string;
    allowedTools?: string[];
    mcpServers?: Record<string, unknown>;
    skills?: Record<string, string>;
  }

  const config: GlobalConfig = {};

  const systemPromptPath = path.join(TEST_CONFIG_DIR, 'rules', 'system.md');
  if (fs.existsSync(systemPromptPath)) {
    config.systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8').trim();
  }

  const settingsPath = path.join(TEST_CONFIG_DIR, 'settings.yaml');
  if (fs.existsSync(settingsPath)) {
    const settings = yaml.parse(fs.readFileSync(settingsPath, 'utf-8'));
    config.defaultModel = settings?.default_model;
    config.allowedTools = settings?.allowed_tools;
  }

  const mcpPath = path.join(TEST_CONFIG_DIR, 'mcp', 'servers.yaml');
  if (fs.existsSync(mcpPath)) {
    config.mcpServers = yaml.parse(fs.readFileSync(mcpPath, 'utf-8'));
  }

  const skillsDir = path.join(TEST_CONFIG_DIR, 'skills');
  if (fs.existsSync(skillsDir)) {
    config.skills = {};
    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const skillName = path.basename(file, '.md');
      config.skills[skillName] = fs.readFileSync(path.join(skillsDir, file), 'utf-8').trim();
    }
  }

  if (!config.systemPrompt) throw new Error('Failed to load systemPrompt');
  if (!config.defaultModel) throw new Error('Failed to load defaultModel');
  if (!config.allowedTools?.length) throw new Error('Failed to load allowedTools');
  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    throw new Error('Failed to load mcpServers');
  }
  if (!config.skills || Object.keys(config.skills).length === 0) {
    throw new Error('Failed to load skills');
  }

  console.log('✓ Full config loaded correctly');
  console.log(`  - systemPrompt: ${config.systemPrompt.substring(0, 30)}...`);
  console.log(`  - defaultModel: ${config.defaultModel}`);
  console.log(`  - allowedTools: ${config.allowedTools.length} tools`);
  console.log(`  - mcpServers: ${Object.keys(config.mcpServers).length} servers`);
  console.log(`  - skills: ${Object.keys(config.skills).length} skills`);
}

function cleanup() {
  if (fs.existsSync(TEST_CONFIG_DIR)) {
    fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
  }
  console.log('✓ Cleanup completed');
}

async function main() {
  console.log('=== Global Config Tests ===\n');

  try {
    setupTestConfigDir();
    console.log('');

    console.log('--- System Prompt ---');
    testSystemPromptReadWrite();
    console.log('');

    console.log('--- MCP Servers ---');
    testMcpServersConfig();
    console.log('');

    console.log('--- Settings ---');
    testSettingsConfig();
    console.log('');

    console.log('--- Skills ---');
    testSkillsConfig();
    console.log('');

    console.log('--- Full Config Load ---');
    testLoadGlobalConfig();
    console.log('');

    console.log('=== All Config Tests Passed! ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    cleanup();
  }
}

main();
