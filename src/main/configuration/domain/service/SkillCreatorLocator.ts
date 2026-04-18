/**
 * SkillCreatorLocator 接口
 *
 * 定位本机的 skill-creator skill 源目录（默认 ~/.claude/skills/skill-creator/）。
 * 生成用例需要把它挂载为会话 plugin-dir，若不存在则快速失败并给出安装提示。
 */

export interface SkillCreatorLocator {
  /**
   * 返回 skill-creator 源目录绝对路径；未找到返回 null
   */
  locate(): string | null;
}
