import { describe, it, expect } from 'vitest';
import { ChatConfig } from '../../src/main/chat/infrastructure/ChatConfig';

describe('ChatConfig.defaultWorkingDir', () => {
  it('uses CHAT_DEFAULT_WORKING_DIR env when present', () => {
    const config = new ChatConfig({ CHAT_DEFAULT_WORKING_DIR: 'D:\\envdir' }, {});
    expect(config.defaultWorkingDir).toBe('D:\\envdir');
  });

  it('uses settings.chat.defaultWorkingDir when env missing', () => {
    const config = new ChatConfig({}, { chat: { defaultWorkingDir: 'D:\\ymldir' } });
    expect(config.defaultWorkingDir).toBe('D:\\ymldir');
  });

  it('falls back to first fs.roots when chat.defaultWorkingDir absent', () => {
    const config = new ChatConfig({}, { fs: { roots: ['D:\\qpon\\workspace', 'D:\\other'] } });
    expect(config.defaultWorkingDir).toBe('D:\\qpon\\workspace');
  });

  it('falls back to process.cwd() when no workspace configured', () => {
    const config = new ChatConfig({}, {});
    expect(config.defaultWorkingDir).toBe(process.cwd());
  });

  it('prefers chat.defaultWorkingDir over fs.roots', () => {
    const config = new ChatConfig(
      {},
      { chat: { defaultWorkingDir: 'D:\\chatdir' }, fs: { roots: ['D:\\rootdir'] } }
    );
    expect(config.defaultWorkingDir).toBe('D:\\chatdir');
  });
});
